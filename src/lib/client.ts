import { WebClient } from "@slack/web-api";
import { readFileSync } from "node:fs";
import { fixSlackMrkdwn } from "./mrkdwn.js";
import { splitMessage, MAX_MESSAGE_LENGTH } from "./split.js";
import type {
  Channel,
  UnreadChannel,
  Message,
  User,
  UserProfile,
  SearchResult,
  AuthInfo,
} from "./types.js";

export interface SlamyClientOptions {
  userToken?: string;
  botToken?: string;
}

export class SlamyClient {
  private webClient: WebClient;

  constructor(opts: SlamyClientOptions) {
    const token = opts.userToken || opts.botToken;
    if (!token) {
      throw new Error("Either userToken or botToken must be provided");
    }
    this.webClient = new WebClient(token);
  }

  // --- Send operations ---

  async postMessage(channel: string, text: string): Promise<{ channel: string; ts: string }> {
    const fixed = fixSlackMrkdwn(text);
    const chunks = splitMessage(fixed);

    const res = await this.webClient.chat.postMessage({
      channel,
      text: chunks[0],
    });
    const ts = res.ts!;

    // Remaining chunks as thread replies
    for (const chunk of chunks.slice(1)) {
      await this.webClient.chat.postMessage({
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
      const res = await this.webClient.chat.postMessage({
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

    await this.webClient.chat.update({
      channel,
      ts,
      text,
    });

    return { channel, ts };
  }

  async deleteMessage(channel: string, ts: string): Promise<void> {
    await this.webClient.chat.delete({ channel, ts });
  }

  async addReaction(channel: string, ts: string, name: string): Promise<void> {
    await this.webClient.reactions.add({
      channel,
      timestamp: ts,
      name,
    });
  }

  async removeReaction(channel: string, ts: string, name: string): Promise<void> {
    await this.webClient.reactions.remove({
      channel,
      timestamp: ts,
      name,
    });
  }

  async uploadFile(
    channel: string,
    fileOrPath: string | Buffer,
    opts?: { threadTs?: string; title?: string; filename?: string },
  ): Promise<void> {
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
      channel_id: channel,
      file: fileContent,
      filename,
      title: opts?.title || filename,
    };
    if (opts?.threadTs) {
      uploadArgs.thread_ts = opts.threadTs;
    }
    await this.webClient.files.uploadV2(uploadArgs as any);
  }

  // --- Read operations ---

  async listChannels(opts?: {
    limit?: number;
    includeArchived?: boolean;
  }): Promise<Channel[]> {
    const limit = opts?.limit ?? 100;

    // First get auth info for user ID
    const authResp = await this.webClient.auth.test();
    const userId = authResp.user_id!;

    const allChannels: any[] = [];
    let cursor: string | undefined;

    do {
      const res = await this.webClient.users.conversations({
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
        const info = await this.webClient.conversations.info({ channel: ch.id });
        if (!info.channel?.is_member) return null;

        const lastRead = (info.channel as any).last_read || "0";

        const hist = await this.webClient.conversations.history({
          channel: ch.id,
          limit: 1,
        });

        if (!hist.messages?.length) return null;
        const latestTs = hist.messages[0].ts!;

        if (latestTs <= lastRead) return null;

        // Count unread
        const countResp = await this.webClient.conversations.history({
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

  async getChannelHistory(channel: string, opts?: { limit?: number }): Promise<Message[]> {
    const res = await this.webClient.conversations.history({
      channel,
      limit: opts?.limit ?? 20,
    });

    return (res.messages || []).map((msg) => ({
      ts: msg.ts!,
      user: msg.user || "",
      text: msg.text || "",
      thread_ts: msg.thread_ts,
      reply_count: msg.reply_count,
    }));
  }

  async getThreadReplies(
    channel: string,
    threadTs: string,
    opts?: { limit?: number },
  ): Promise<Message[]> {
    const res = await this.webClient.conversations.replies({
      channel,
      ts: threadTs,
      limit: opts?.limit ?? 50,
    });

    return (res.messages || []).map((msg) => ({
      ts: msg.ts!,
      user: msg.user || "",
      text: msg.text || "",
    }));
  }

  async listUsers(opts?: {
    includeDeactivated?: boolean;
    includeBots?: boolean;
  }): Promise<User[]> {
    const res = await this.webClient.users.list({});

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
    const res = await this.webClient.users.info({ user: userId });
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
    const res = await this.webClient.search.messages({
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

  async authTest(): Promise<AuthInfo> {
    const res = await this.webClient.auth.test();
    return {
      user_id: res.user_id || "",
      user: res.user || "",
      team_id: res.team_id || "",
      team: res.team || "",
      url: res.url || "",
    };
  }
}
