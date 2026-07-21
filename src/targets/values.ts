import { TargetError } from "./errors.js";

declare const channelIdBrand: unique symbol;
declare const enterpriseIdBrand: unique symbol;
declare const slackTimestampBrand: unique symbol;

export type ChannelId = string & { readonly [channelIdBrand]: "ChannelId" };
export type EnterpriseId = string & { readonly [enterpriseIdBrand]: "EnterpriseId" };
export type SlackTimestamp = string & { readonly [slackTimestampBrand]: "SlackTimestamp" };

const CHANNEL_ID_PATTERN = /^[CDG][A-Z0-9]{1,63}$/;
const ENTERPRISE_ID_PATTERN = /^E[A-Z0-9]+$/;
const SLACK_TIMESTAMP_PATTERN = /^\d{9,12}\.\d{6}$/;
const COMPACT_TIMESTAMP_PATTERN = /^\d{15,18}$/;

export function parseChannelId(value: unknown): ChannelId {
  if (typeof value !== "string" || !CHANNEL_ID_PATTERN.test(value)) {
    throw new TargetError("INVALID_CHANNEL_ID", "Slack channel ID is invalid");
  }
  return value as ChannelId;
}

export function parseEnterpriseId(value: unknown): EnterpriseId {
  if (typeof value !== "string" || !ENTERPRISE_ID_PATTERN.test(value)) {
    throw new TargetError("INVALID_TARGET", "Slack Enterprise ID is invalid");
  }
  return value as EnterpriseId;
}

export function parseSlackTimestamp(value: unknown): SlackTimestamp {
  if (typeof value !== "string" || !SLACK_TIMESTAMP_PATTERN.test(value)) {
    throw new TargetError("INVALID_TIMESTAMP", "Slack timestamp is invalid");
  }
  return value as SlackTimestamp;
}

export function parseCompactSlackTimestamp(value: unknown): SlackTimestamp {
  if (typeof value !== "string" || !COMPACT_TIMESTAMP_PATTERN.test(value)) {
    throw new TargetError("INVALID_TIMESTAMP", "Slack permalink timestamp is invalid");
  }
  return parseSlackTimestamp(`${value.slice(0, -6)}.${value.slice(-6)}`);
}

export function parseSlackTimestampEither(value: unknown): SlackTimestamp {
  if (typeof value === "string" && value.includes(".")) return parseSlackTimestamp(value);
  return parseCompactSlackTimestamp(value);
}
