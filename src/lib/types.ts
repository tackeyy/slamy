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

/** Slack message. */
export interface Message {
  ts: string;
  user: string;
  text: string;
  thread_ts?: string;
  reply_count?: number;
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
