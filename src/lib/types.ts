/** Slack channel information. */
export interface Channel {
  id: string;
  name: string;
  topic: string;
  purpose: string;
  num_members: number;
  is_private: boolean;
  is_archived: boolean;
}

/** Slack channel with unread information. */
export interface UnreadChannel extends Channel {
  unread_count: number;
}

/** Slack file info. */
export interface SlackFileInfo {
  id: string;
  name: string;
  mimetype: string;
  filetype: string;
  size: number;
  url_private_download: string;
}

/** Slack message. */
export interface Message {
  ts: string;
  user: string;
  text: string;
  thread_ts?: string;
  reply_count?: number;
  files?: SlackFileInfo[];
}

/** Slack user. */
export interface User {
  id: string;
  name: string;
  real_name: string;
  display_name: string;
  email?: string;
  is_bot: boolean;
  deleted: boolean;
}

/** Detailed user profile. */
export interface UserProfile {
  id: string;
  name: string;
  real_name: string;
  display_name: string;
  email: string;
  title: string;
  phone: string;
  status_text: string;
  status_emoji: string;
  tz: string;
  is_admin: boolean;
  is_bot: boolean;
  deleted: boolean;
}

/** Search result. */
export interface SearchResult {
  matches: SearchMatch[];
  total: number;
  page: number;
}

/** Individual search match. */
export interface SearchMatch {
  ts: string;
  channel: string;
  channel_id: string;
  user: string;
  text: string;
  permalink: string;
}

/** Auth test result. */
export interface AuthInfo {
  user_id: string;
  user: string;
  team_id: string;
  team: string;
  url: string;
}

/** A reaction item returned by reactions.list. */
export interface ReactionItem {
  name: string;
  channel: string;
  timestamp: string;
  message_text: string;
}

/** Result of reactions.list. */
export interface ReactionsListResult {
  items: ReactionItem[];
  total: number;
}

/** Slack reaction_added event payload. */
export interface ReactionAddedEvent {
  type: "reaction_added";
  user: string;
  reaction: string;
  item: { type: string; channel: string; ts: string };
  item_user: string;
  event_ts: string;
}

/** User engagement metrics for a date range. */
export interface EngagementMetrics {
  userId: string;
  since: string; // "YYYY-MM-DD"
  until: string; // "YYYY-MM-DD"
  postCount: number;
  reactionGivenCount: number; // 日付範囲内でリアクションしたメッセージ数
  fetchedAt: string; // ISO 8601
}

/** Slack event payload. */
export interface SlackEvent {
  type: string;
  user: string;
  text: string;
  ts: string;
  channel: string;
  thread_ts?: string;
  channel_type?: string;
  subtype?: string;
  bot_id?: string;
}
