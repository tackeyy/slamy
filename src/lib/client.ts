import { WebClient, LogLevel } from "@slack/web-api";
import { readFileSync } from "node:fs";
import { fixSlackMrkdwn } from "./mrkdwn.js";
import {
  splitMessage,
  CHAT_POSTMESSAGE_MAX_LENGTH,
  CHAT_UPDATE_MAX_LENGTH,
} from "./split.js";
import { tzDateToEpochSec } from "./tz.js";
import type {
  Channel,
  UnreadChannel,
  Message,
  MessageReaction,
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

/**
 * Slack API の生メッセージを slamy の `Message` 型に正規化する。
 * Block Kit (blocks) / attachments / reactions / bot 識別子等を透過して、
 * interactive content を呼び出し側で観測可能にする。
 */
function mapMessage(msg: any): Message {
  const m: Message = {
    ts: msg.ts!,
    user: msg.user || "",
    text: msg.text || "",
  };
  if (msg.thread_ts !== undefined) m.thread_ts = msg.thread_ts;
  if (msg.reply_count !== undefined) m.reply_count = msg.reply_count;
  if (msg.files !== undefined) m.files = msg.files as SlackFileInfo[];
  if (msg.bot_id !== undefined) m.bot_id = msg.bot_id;
  if (msg.subtype !== undefined) m.subtype = msg.subtype;
  if (msg.team !== undefined) m.team = msg.team;
  if (Array.isArray(msg.blocks)) m.blocks = msg.blocks as Record<string, unknown>[];
  if (Array.isArray(msg.attachments)) m.attachments = msg.attachments as Record<string, unknown>[];
  if (Array.isArray(msg.reactions)) {
    m.reactions = (msg.reactions as any[]).map((r): MessageReaction => ({
      name: r.name,
      count: r.count,
      users: Array.isArray(r.users) ? r.users : [],
    }));
  }
  return m;
}

export class SlamyClient {
  private botClient: WebClient;
  private userClient: WebClient;
  private botTokenStr: string;
  private userTokenStr: string;

  // user_id -> display name (空文字 = 解決失敗、id 自体を返すと区別不能なので未解決のまま)
  private userNameCache = new Map<string, string>();
  // 並列呼び出し時に users.list が複数回飛ぶ race condition を避けるため
  // 「進行中の users.list Promise」を保持する。
  private userListPromise: Promise<void> | null = null;

  // channel_id -> channel name (resolveChannelName 用、resolveUserName と同パターン)
  private channelNameCache = new Map<string, string>();
  private channelListPromise: Promise<void> | null = null;

  constructor(opts: SlamyClientOptions) {
    if (!opts.botToken && !opts.userToken) {
      throw new Error("Either userToken or botToken must be provided");
    }
    // Bot token for write operations (postMessage, reactions, file upload)
    // User token for read/search operations that require user-level access
    this.botClient = new WebClient(opts.botToken || opts.userToken, { logLevel: LogLevel.WARN });
    this.userClient = new WebClient(opts.userToken || opts.botToken, { logLevel: LogLevel.WARN });
    this.botTokenStr = opts.botToken || opts.userToken || "";
    this.userTokenStr = opts.userToken || opts.botToken || "";
  }

  // --- User name resolver ---

  /**
   * user_id (U..) or bot_id (B..) を表示名に解決する。
   *
   * 戦略:
   * 1. 初回呼び出し時に users.list を全件取得して in-memory cache に格納
   * 2. cache miss なら users.info で個別取得 (cache に追加)
   * 3. bot_id の場合は bots.info で取得
   * 4. すべて失敗したら id 自体を返す (呼び出し側で format 崩れしないように)
   *
   * 表示名の優先順位: profile.display_name > real_name > name > id
   */
  async resolveUserName(userOrBotId: string): Promise<string> {
    if (!userOrBotId) return userOrBotId;

    if (this.userNameCache.has(userOrBotId)) {
      return this.userNameCache.get(userOrBotId)!;
    }

    // Bot ID は users.list/info に出ないので分岐
    if (userOrBotId.startsWith("B")) {
      try {
        const res = await (this.botClient as any).bots.info({ bot: userOrBotId });
        const name = res.bot?.name || userOrBotId;
        this.userNameCache.set(userOrBotId, name);
        return name;
      } catch {
        this.userNameCache.set(userOrBotId, userOrBotId);
        return userOrBotId;
      }
    }

    if (!this.userListPromise) {
      this.userListPromise = (async () => {
        try {
          // cursor pagination で 1000 名超のワークスペースでも全件 cache。
          // resolveChannelName と同型実装 (PR #23)。
          let cursor: string | undefined;
          do {
            const res: any = await this.userClient.users.list({ cursor, limit: 1000 });
            for (const u of res.members || []) {
              if (!u.id) continue;
              const display =
                u.profile?.display_name ||
                u.real_name ||
                u.name ||
                u.id;
              this.userNameCache.set(u.id, display);
            }
            cursor = res.response_metadata?.next_cursor || undefined;
          } while (cursor);
        } catch {
          // users.list 失敗時も users.info にフォールバック
        }
      })();
    }
    await this.userListPromise;
    if (this.userNameCache.has(userOrBotId)) {
      return this.userNameCache.get(userOrBotId)!;
    }

    try {
      const res = await this.userClient.users.info({ user: userOrBotId });
      const u = res.user;
      const display =
        u?.profile?.display_name ||
        u?.real_name ||
        u?.name ||
        userOrBotId;
      this.userNameCache.set(userOrBotId, display);
      return display;
    } catch {
      this.userNameCache.set(userOrBotId, userOrBotId);
      return userOrBotId;
    }
  }

  /** 複数 ID をまとめて解決する (users.list は 1 回だけ呼ばれる)。 */
  async resolveUserNames(ids: string[]): Promise<Map<string, string>> {
    const entries = await Promise.all(
      ids.map(async (id) => [id, await this.resolveUserName(id)] as const),
    );
    return new Map(entries);
  }

  // --- Channel name resolver ---

  /**
   * channel_id を channel name に解決する。
   *
   * 戦略:
   * 1. 初回呼び出し時に conversations.list を全件取得して in-memory cache に格納
   * 2. cache miss なら conversations.info で個別取得 (cache に追加)
   * 3. 失敗時は id をそのまま返す (呼び出し側で format 崩れしないように)
   *
   * 並列呼び出し時の race condition は Promise キャッシュで防ぐ。
   */
  async resolveChannelName(channelId: string): Promise<string> {
    if (!channelId) return channelId;

    if (this.channelNameCache.has(channelId)) {
      return this.channelNameCache.get(channelId)!;
    }

    if (!this.channelListPromise) {
      this.channelListPromise = (async () => {
        try {
          // IM (DM) は Slack API 仕様で name=null のため types から除外。
          // DM の表示名を欲しい場合は呼び出し側で resolveUserName(channel.user) を使う。
          // cursor ページネーション対応で 1000 件超のワークスペースでも全件 cache。
          let cursor: string | undefined;
          do {
            const res: any = await this.userClient.conversations.list({
              types: "public_channel,private_channel,mpim",
              limit: 1000,
              cursor,
            });
            for (const ch of res.channels || []) {
              if (!ch.id) continue;
              this.channelNameCache.set(ch.id, ch.name || ch.id);
            }
            cursor = res.response_metadata?.next_cursor || undefined;
          } while (cursor);
        } catch {
          // conversations.list 失敗時も conversations.info にフォールバック
        }
      })();
    }
    await this.channelListPromise;
    if (this.channelNameCache.has(channelId)) {
      return this.channelNameCache.get(channelId)!;
    }

    try {
      const res = await this.userClient.conversations.info({ channel: channelId });
      const name = res.channel?.name || channelId;
      this.channelNameCache.set(channelId, name);
      return name;
    } catch {
      this.channelNameCache.set(channelId, channelId);
      return channelId;
    }
  }

  /** 複数 ID をまとめて解決する (conversations.list は 1 回だけ呼ばれる)。 */
  async resolveChannelNames(ids: string[]): Promise<Map<string, string>> {
    const entries = await Promise.all(
      ids.map(async (id) => [id, await this.resolveChannelName(id)] as const),
    );
    return new Map(entries);
  }

  // --- Send operations ---

  async scheduleMessage(
    channel: string,
    text: string,
    postAt: number,
  ): Promise<{ channel: string; scheduled_message_id: string; post_at: number }> {
    const fixed = fixSlackMrkdwn(text);
    // chat.scheduleMessage は chat.postMessage と同じ 40,000 chars 上限 (公式仕様)
    const chunks = splitMessage(fixed, CHAT_POSTMESSAGE_MAX_LENGTH);

    if (chunks.length > 1) {
      throw new Error(
        `Message exceeds ${CHAT_POSTMESSAGE_MAX_LENGTH} characters. scheduleMessage does not support auto-splitting.`,
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
    const chunks = splitMessage(fixed, CHAT_POSTMESSAGE_MAX_LENGTH);

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
    options?: { broadcast?: boolean },
  ): Promise<{ channel: string; ts: string }> {
    const fixed = fixSlackMrkdwn(text);
    const chunks = splitMessage(fixed, CHAT_POSTMESSAGE_MAX_LENGTH);

    let firstTs = "";
    for (const chunk of chunks) {
      const params: Record<string, unknown> = {
        channel,
        text: chunk,
        thread_ts: threadTs,
      };
      if (options?.broadcast) {
        params.reply_broadcast = true;
      }
      const res = await this.botClient.chat.postMessage(params as any);
      if (!firstTs) firstTs = res.ts!;
    }

    return { channel, ts: firstTs };
  }

  async updateMessage(
    channel: string,
    ts: string,
    text: string,
  ): Promise<{ channel: string; ts: string }> {
    const fixed = fixSlackMrkdwn(text);
    if ([...fixed].length > CHAT_UPDATE_MAX_LENGTH) {
      throw new Error(
        `Message exceeds ${CHAT_UPDATE_MAX_LENGTH} characters. updateMessage does not support auto-splitting.`,
      );
    }

    await this.botClient.chat.update({
      channel,
      ts,
      text: fixed,
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

  /**
   * AI Assistant スレッドの進捗ステータスを設定する。
   *
   * Slack ネイティブの typing indicator（メッセージ入力欄上に表示）として描画され、
   * クライアント側で自動的にアニメーションされる。`loadingMessages` を渡すと
   * Slack が配列を rotate（循環表示）する（最大 10 個）。
   *
   * 動作前提:
   * - Slack App ダッシュボードで「Agents & AI Apps」機能が有効化されていること
   * - `assistant:write` または `chat:write` スコープが付与されていること
   *
   * アプリ自身が thread にメッセージを送信すると自動でクリアされる。
   * 2 分間更新がないと自動的に消える。
   *
   * @see https://docs.slack.dev/reference/methods/assistant.threads.setStatus/
   */
  async setAssistantStatus(
    channelId: string,
    threadTs: string,
    status: string,
    opts?: { loadingMessages?: string[] },
  ): Promise<void> {
    const params: {
      channel_id: string;
      thread_ts: string;
      status: string;
      loading_messages?: string[];
    } = {
      channel_id: channelId,
      thread_ts: threadTs,
      status,
    };
    if (opts?.loadingMessages && opts.loadingMessages.length > 0) {
      params.loading_messages = opts.loadingMessages;
    }
    await this.botClient.assistant.threads.setStatus(params);
  }

  async removeReaction(channel: string, ts: string, name: string): Promise<void> {
    await this.botClient.reactions.remove({
      channel,
      timestamp: ts,
      name,
    });
  }

  /**
   * 指定メッセージに付いているリアクション一覧を返す (reactions.get API)。
   *
   * - `full: true` で各リアクションに reaction した全 users を取得
   * - メッセージが見つからない / reactions が無い場合は空配列
   */
  async getMessageReactions(
    channel: string,
    ts: string,
  ): Promise<Array<{ name: string; count: number; users: string[] }>> {
    const detail = await this.getMessageReactionsDetail(channel, ts);
    return detail.reactions;
  }

  /**
   * 指定メッセージのリアクション一覧 + 元メッセージのテキストを返す。
   * `getMessageReactions` よりリッチな情報を必要とする UI 用途向け。
   */
  async getMessageReactionsDetail(
    channel: string,
    ts: string,
  ): Promise<{
    message_text: string;
    reactions: Array<{ name: string; count: number; users: string[] }>;
  }> {
    const res = await (this.botClient.reactions as any).get({
      channel,
      timestamp: ts,
      full: true,
    });
    const reactions = (res?.message?.reactions || []).map((r: any) => ({
      name: r.name,
      count: r.count,
      users: Array.isArray(r.users) ? r.users : [],
    }));
    return {
      message_text: res?.message?.text || "",
      reactions,
    };
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

  // --- Channel info ---

  async getChannelInfo(channelId: string): Promise<Channel> {
    const res = await this.botClient.conversations.info({ channel: channelId });
    const ch = res.channel as any;
    return {
      id: ch.id,
      name: ch.name || "",
      topic: ch.topic?.value || "",
      purpose: ch.purpose?.value || "",
      num_members: ch.num_members || 0,
      is_private: ch.is_private || false,
      is_archived: ch.is_archived || false,
    };
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

      const batch = (res.messages || []).map((msg) => mapMessage(msg));

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
    return (res.messages || []).map((msg) => mapMessage(msg));
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

    return (res.messages || []).map((msg) => mapMessage(msg));
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
    // 集計タイムゾーン (デフォルト Asia/Tokyo)
    // search.messages の after:/before: は Slack ワークスペース TZ で評価される一方、
    // reactions.list のフィルタは meta epoch 単位なのでこちらで TZ を合わせる必要がある。
    const tz = process.env.SLAMY_TZ || "Asia/Tokyo";

    // postCount: search.messages で取得 (after: は exclusive なので 1 日前にずらす)
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

    // reactionGivenCount: reactions.list で日付フィルタ付きカウント
    // since/until は tz の 0:00 〜 23:59:59 を範囲とする (postCount 側と TZ を揃える)
    const sinceEpoch = tzDateToEpochSec(opts.since, "00:00:00", tz);
    const untilEpoch = tzDateToEpochSec(untilStr, "23:59:59", tz);
    const MAX_REACTION_PAGES = 10;

    let reactionGivenCount = 0;
    let cursor: string | undefined;
    let pages = 0;

    do {
      pages++;
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

        // 範囲外はスキップ (reactions.list は付与順なので早期終了はしない)
        if (ts < sinceEpoch || ts > untilEpoch) continue;

        const reactions: any[] = msg?.reactions || [];
        const hasUserReaction = reactions.some((r: any) =>
          (r.users || []).includes(userId),
        );
        if (hasUserReaction) {
          reactionGivenCount++;
        }
      }

      cursor = res.response_metadata?.next_cursor || undefined;
    } while (cursor && pages < MAX_REACTION_PAGES);

    const truncated = Boolean(cursor) && pages >= MAX_REACTION_PAGES;
    if (truncated) {
      console.warn(
        `[slamy] reactions.list truncated at ${MAX_REACTION_PAGES} pages for user=${userId} (since=${opts.since}, until=${untilStr}). reactionGivenCount may be under-counted.`,
      );
    }

    return {
      userId,
      since: opts.since,
      until: untilStr,
      postCount,
      reactionGivenCount,
      fetchedAt: new Date().toISOString(),
      timezone: tz,
      truncated,
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
