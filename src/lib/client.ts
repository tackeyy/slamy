import { WebClient } from "@slack/web-api";
import { readFileSync } from "node:fs";
import { fixSlackMrkdwn } from "./mrkdwn.js";
import { splitMessage, MAX_MESSAGE_LENGTH } from "./split.js";
import type {
  Channel,
  UnreadChannel,
  Message,
  SlackFileInfo,
  User,
  UserProfile,
  SearchResult,
  AuthInfo,
  ReactionItem,
  ReactionsListResult,
} from "./types.js";

export interface SlamyClientOptions {
  userToken?: string;
  botToken?: string;
}

export class SlamyClient {
  private botClient: WebClient;
  private userClient: WebClient;
  private botTokenStr: string;
  private userTokenStr: string;

  constructor(opts: SlamyClientOptions) {
    if (!opts.botToken && !opts.userToken) {
      throw new Error("Either userToken or botToken must be provided");
    }
    // Bot token for write operations (postMessage, reactions, file upload)
    // User token for read/search operations that require user-level access
    this.botClient = new WebClient(opts.botToken || opts.userToken);
    this.userClient = new WebClient(opts.userToken || opts.botToken);
    this.botTokenStr = opts.botToken || opts.userToken || "";
    this.userTokenStr = opts.userToken || opts.botToken || "";
  }

  // --- Send operations ---

  async scheduleMessage(
    channel: string,
    text: string,
    postAt: number,
  ): Promise<{ channel: string; scheduled_message_id: string; post_at: number }> {
    const fixed = fixSlackMrkdwn(text);
    const chunks = splitMessage(fixed);

    if (chunks.length > 1) {
      throw new Error(
        `Message exceeds ${MAX_MESSAGE_LENGTH} characters. scheduleMessage does not support auto-splitting.`,
      );
    }

    const res = await this.botClient.chat.scheduleMessage({
      channel,
      text: chunks[0],
      post_at: postAt,
    });

    return {
      channel,
      scheduled_message_id: res.scheduled_message_id!,
      post_at: postAt,
    };
  }

  async postMessage(channel: string, text: string): Promise<{ channel: string; ts: string }> {
    const fixed = fixSlackMrkdwn(text);
    const chunks = splitMessage(fixed);

    const res = await this.botClient.chat.postMessage({
      channel,
      text: chunks[0],
    });
    const ts = res.ts!;

    // Remaining chunks as thread replies
    for (const chunk of chunks.slice(1)) {
      await this.botClient.chat.postMessage({
        channel,
        text: chunk,
        thread_ts: ts,
      });
    }

    return { channel, ts };
  }

  async replyToThread(
    channel: string,
    threadTs: string,
    text: string,
  ): Promise<{ channel: string; ts: string }> {
    const fixed = fixSlackMrkdwn(text);
    const chunks = splitMessage(fixed);

    let firstTs = "";
    for (const chunk of chunks) {
      const res = await this.botClient.chat.postMessage({
        channel,
        text: chunk,
        thread_ts: threadTs,
      });
      if (!firstTs) firstTs = res.ts!;
    }

    return { channel, ts: firstTs };
  }

  async updateMessage(
    channel: string,
    ts: string,
    text: string,
  ): Promise<{ channel: string; ts: string }> {
    if ([...text].length > MAX_MESSAGE_LENGTH) {
      throw new Error(
        `Message exceeds ${MAX_MESSAGE_LENGTH} characters. updateMessage does not support auto-splitting.`,
      );
    }

    await this.botClient.chat.update({
      channel,
      ts,
      text,
    });

    return { channel, ts };
  }

  async deleteMessage(channel: string, ts: string): Promise<void> {
    await this.botClient.chat.delete({ channel, ts });
  }

  async addReaction(channel: string, ts: string, name: string): Promise<void> {
    await this.botClient.reactions.add({
      channel,
      timestamp: ts,
      name,
    });
  }

  async removeReaction(channel: string, ts: string, name: string): Promise<void> {
    await this.botClient.reactions.remove({
      channel,
      timestamp: ts,
      name,
    });
  }

  async uploadFile(
    channel: string,
    fileOrPath: string | Buffer,
    opts?: { threadTs?: string; title?: string; filename?: string; initialComment?: string },
  ): Promise<void> {
    // User ID (U...) → DM channel ID via conversations.open
    let channelId = channel;
    if (/^U[A-Z0-9]+$/.test(channel)) {
      const dm = await this.botClient.conversations.open({ users: channel });
      channelId = dm.channel!.id!;
    }

    let fileContent: Buffer;
    let filename: string;

    if (typeof fileOrPath === "string") {
      fileContent = readFileSync(fileOrPath);
      filename = opts?.filename || fileOrPath.split("/").pop() || "file";
    } else {
      fileContent = fileOrPath;
      filename = opts?.filename || "file";
    }

    const uploadArgs: Record<string, unknown> = {
      channel_id: channelId,
      file: fileContent,
      filename,
      title: opts?.title || filename,
    };
    if (opts?.threadTs) {
      uploadArgs.thread_ts = opts.threadTs;
    }
    if (opts?.initialComment) {
      uploadArgs.initial_comment = opts.initialComment;
    }
    await this.botClient.files.uploadV2(uploadArgs as any);
  }

  // --- Read operations ---

  async listChannels(opts?: {
    limit?: number;
    includeArchived?: boolean;
  }): Promise<Channel[]> {
    const limit = opts?.limit ?? 100;

    // First get auth info for user ID
    const authResp = await this.userClient.auth.test();
    const userId = authResp.user_id!;

    const allChannels: any[] = [];
    let cursor: string | undefined;

    do {
      const res = await this.userClient.users.conversations({
        user: userId,
        types: "public_channel,private_channel",
        limit: Math.min(limit, 200),
        exclude_archived: !opts?.includeArchived,
        cursor,
      });

      allChannels.push(...(res.channels || []));
      cursor = res.response_metadata?.next_cursor || undefined;

      if (limit > 0 && allChannels.length >= limit) break;
    } while (cursor);

    const channels = limit > 0 ? allChannels.slice(0, limit) : allChannels;

    return channels.map((ch) => ({
      id: ch.id,
      name: ch.name || "",
      topic: ch.topic?.value || "",
      purpose: ch.purpose?.value || "",
      num_members: ch.num_members || 0,
      is_private: ch.is_private || false,
      is_archived: ch.is_archived || false,
    }));
  }

  async listUnreadChannels(opts?: { limit?: number }): Promise<UnreadChannel[]> {
    const channels = await this.listChannels(opts);

    const results = await Promise.allSettled(
      channels.map(async (ch) => {
        const info = await this.userClient.conversations.info({ channel: ch.id });
        if (!info.channel?.is_member) return null;

        const lastRead = (info.channel as any).last_read || "0";

        const hist = await this.userClient.conversations.history({
          channel: ch.id,
          limit: 1,
        });

        if (!hist.messages?.length) return null;
        const latestTs = hist.messages[0].ts!;

        if (latestTs <= lastRead) return null;

        // Count unread
        const countResp = await this.userClient.conversations.history({
          channel: ch.id,
          oldest: lastRead,
          limit: 100,
        });

        return {
          ...ch,
          unread_count: countResp.messages?.length || 1,
        };
      }),
    );

    return results
      .filter(
        (r): r is PromiseFulfilledResult<UnreadChannel | null> => r.status === "fulfilled",
      )
      .map((r) => r.value)
      .filter((v): v is UnreadChannel => v !== null);
  }

  async getChannelHistory(channel: string, opts?: { limit?: number; oldest?: string; latest?: string }): Promise<Message[]> {
    const maxMessages = opts?.limit ?? 20;
    const allMessages: Message[] = [];
    let cursor: string | undefined;

    do {
      const remaining = maxMessages - allMessages.length;
      const batchSize = Math.min(remaining, 200);

      const params: Record<string, unknown> = {
        channel,
        limit: batchSize,
      };
      if (opts?.oldest) params.oldest = opts.oldest;
      if (opts?.latest) params.latest = opts.latest;
      if (cursor) params.cursor = cursor;

      const res = await this.userClient.conversations.history(params as any);

      const batch = (res.messages || []).map((msg) => ({
        ts: msg.ts!,
        user: msg.user || "",
        text: msg.text || "",
        thread_ts: msg.thread_ts,
        reply_count: msg.reply_count,
        files: msg.files as SlackFileInfo[] | undefined,
      }));

      allMessages.push(...batch);

      const hasMore = (res as any).has_more === true;
      cursor = (res as any).response_metadata?.next_cursor || undefined;

      if (!hasMore || !cursor || allMessages.length >= maxMessages) break;
    } while (true);

    return allMessages.slice(0, maxMessages);
  }

  async getMessageAt(channel: string, ts: string): Promise<Message[]> {
    const res = await this.botClient.conversations.history({
      channel,
      oldest: ts,
      latest: ts,
      inclusive: true,
      limit: 1,
    });
    return (res.messages || []).map((msg) => ({
      ts: msg.ts!,
      user: msg.user || "",
      text: msg.text || "",
      thread_ts: msg.thread_ts,
      reply_count: msg.reply_count,
      files: msg.files as SlackFileInfo[] | undefined,
    }));
  }

  async getFileInfo(fileId: string): Promise<SlackFileInfo> {
    const res = await this.userClient.files.info({ file: fileId });
    const f = res.file as any;
    return {
      id: f.id,
      name: f.name,
      mimetype: f.mimetype,
      filetype: f.filetype,
      size: f.size,
      url_private_download: f.url_private_download,
    };
  }

  async downloadFileStream(fileUrl: string): Promise<Response> {
    // Slack file URLs may redirect; Authorization header is stripped on redirect.
    // Use manual redirect handling to re-attach auth header if needed.
    let response = await fetch(fileUrl, {
      headers: { Authorization: `Bearer ${this.userTokenStr}` },
      redirect: "manual",
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location) {
        response = await fetch(location, {
          headers: { Authorization: `Bearer ${this.userTokenStr}` },
          redirect: "follow",
        });
      }
    }
    if (!response.ok) {
      throw new Error(`File download failed: HTTP ${response.status}`);
    }
    return response;
  }

  async getThreadReplies(
    channel: string,
    threadTs: string,
    opts?: { limit?: number },
  ): Promise<Message[]> {
    const res = await this.userClient.conversations.replies({
      channel,
      ts: threadTs,
      limit: opts?.limit ?? 50,
    });

    return (res.messages || []).map((msg) => ({
      ts: msg.ts!,
      user: msg.user || "",
      text: msg.text || "",
      files: msg.files as SlackFileInfo[] | undefined,
    }));
  }

  async listUsers(opts?: {
    includeDeactivated?: boolean;
    includeBots?: boolean;
  }): Promise<User[]> {
    const res = await this.userClient.users.list({});

    return (res.members || [])
      .filter((u) => {
        if (!opts?.includeBots && u.is_bot) return false;
        if (!opts?.includeDeactivated && u.deleted) return false;
        return true;
      })
      .map((u) => ({
        id: u.id!,
        name: u.name || "",
        real_name: u.real_name || "",
        display_name: u.profile?.display_name || "",
        email: u.profile?.email,
        is_bot: u.is_bot || false,
        deleted: u.deleted || false,
      }));
  }

  async getUserProfile(userId: string): Promise<UserProfile> {
    const res = await this.userClient.users.info({ user: userId });
    const u = res.user!;

    return {
      id: u.id!,
      name: u.name || "",
      real_name: u.real_name || "",
      display_name: u.profile?.display_name || "",
      email: u.profile?.email || "",
      title: u.profile?.title || "",
      phone: u.profile?.phone || "",
      status_text: u.profile?.status_text || "",
      status_emoji: u.profile?.status_emoji || "",
      tz: u.tz || "",
      is_admin: u.is_admin || false,
      is_bot: u.is_bot || false,
      deleted: u.deleted || false,
    };
  }

  async searchMessages(
    query: string,
    opts?: { count?: number; page?: number; sort?: string; sortDir?: string },
  ): Promise<SearchResult> {
    const res = await this.userClient.search.messages({
      query,
      sort: (opts?.sort || "timestamp") as "timestamp" | "score",
      sort_dir: (opts?.sortDir || "desc") as "desc" | "asc",
      count: opts?.count || 20,
      page: opts?.page || 1,
    });

    const matches = (res.messages?.matches || []).map((m: any) => ({
      ts: m.ts,
      channel: m.channel?.name || "",
      channel_id: m.channel?.id || "",
      user: m.user || "",
      text: m.text || "",
      permalink: m.permalink || "",
    }));

    return {
      matches,
      total: res.messages?.total || 0,
      page: res.messages?.paging?.page || 1,
    };
  }

  async getChannelMembers(channel: string): Promise<string[]> {
    const allMembers: string[] = [];
    let cursor: string | undefined;

    do {
      const res = await this.userClient.conversations.members({
        channel,
        limit: 200,
        ...(cursor && { cursor }),
      } as any);

      allMembers.push(...((res as any).members || []));
      cursor = (res as any).response_metadata?.next_cursor || undefined;
    } while (cursor);

    return allMembers;
  }

  async authTest(): Promise<AuthInfo> {
    const res = await this.userClient.auth.test();
    return {
      user_id: res.user_id || "",
      user: res.user || "",
      team_id: res.team_id || "",
      team: res.team || "",
      url: res.url || "",
    };
  }

  async getUserEngagement(
    userId: string,
    opts: { since: string; until?: string },
  ): Promise<import("./types.js").EngagementMetrics> {
    // postCount: search.messages で取得
    // Slack の after: は「その日より後」なので1日前にずらす（UTC で計算）
    const sinceDate = new Date(opts.since + "T00:00:00Z");
    const dayBefore = new Date(sinceDate.getTime() - 86400000);
    const afterStr = dayBefore.toISOString().slice(0, 10);

    let query = `from:<@${userId}> after:${afterStr}`;
    const untilStr = opts.until || opts.since;

    if (opts.until) {
      const untilDate = new Date(opts.until + "T00:00:00Z");
      const dayAfter = new Date(untilDate.getTime() + 86400000);
      const beforeStr = dayAfter.toISOString().slice(0, 10);
      query += ` before:${beforeStr}`;
    }

    const searchRes = await this.userClient.search.messages({
      query,
      sort: "timestamp" as any,
      sort_dir: "desc" as any,
      count: 1,
      page: 1,
    });
    const postCount = searchRes.messages?.total || 0;

    // reactionGivenCount: reactions.list で日付フィルタ付きカウント（UTC）
    const sinceEpoch = new Date(opts.since + "T00:00:00Z").getTime() / 1000;
    const untilEpoch = new Date(untilStr + "T23:59:59Z").getTime() / 1000;

    let reactionGivenCount = 0;
    let cursor: string | undefined;
    let earlyBreak = false;

    do {
      const res = await (this.userClient.reactions as any).list({
        user: userId,
        limit: 200,
        cursor,
        full: true,
      });

      const rawItems: any[] = res.items || [];
      for (const item of rawItems) {
        if (item.type !== "message") continue;

        const msg = item.message;
        const ts = parseFloat(msg?.ts || "0");

        // 逆時系列順: since より前なら早期終了
        if (ts < sinceEpoch) {
          earlyBreak = true;
          break;
        }

        // until より後はスキップ
        if (ts > untilEpoch) continue;

        // このメッセージにユーザーがリアクションしているか確認
        const reactions: any[] = msg?.reactions || [];
        const hasUserReaction = reactions.some((r: any) =>
          (r.users || []).includes(userId),
        );
        if (hasUserReaction) {
          reactionGivenCount++;
        }
      }

      if (earlyBreak) break;
      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor);

    return {
      userId,
      since: opts.since,
      until: untilStr,
      postCount,
      reactionGivenCount,
      fetchedAt: new Date().toISOString(),
    };
  }

  async listReactions(opts?: {
    user?: string;
    limit?: number;
  }): Promise<ReactionsListResult> {
    const limit = opts?.limit ?? 100;

    // user が省略された場合は認証ユーザー自身のIDを取得
    let userId = opts?.user;
    if (!userId) {
      const auth = await this.userClient.auth.test();
      userId = auth.user_id!;
    }

    const allItems: ReactionItem[] = [];
    let cursor: string | undefined;

    do {
      const res = await (this.userClient.reactions as any).list({
        user: userId,
        limit: Math.min(limit - allItems.length, 200),
        cursor,
        full: true,
      });

      const rawItems: any[] = res.items || [];
      for (const item of rawItems) {
        if (item.type !== "message") continue;

        const msg = item.message;
        const channel: string = item.channel || "";
        const timestamp: string = msg?.ts || "";
        const reactions: any[] = msg?.reactions || [];

        // このユーザーが付けたリアクションのみ抽出
        for (const reaction of reactions) {
          const users: string[] = reaction.users || [];
          if (!users.includes(userId!)) continue;

          let text: string = msg?.text || "";
          if (text.length > 100) text = text.slice(0, 100) + "...";

          allItems.push({
            name: reaction.name as string,
            channel,
            timestamp,
            message_text: text,
          });
        }

        if (allItems.length >= limit) break;
      }

      cursor = res.response_metadata?.next_cursor || undefined;
      if (allItems.length >= limit) break;
    } while (cursor);

    const items = allItems.slice(0, limit);
    return { items, total: items.length };
  }
}
