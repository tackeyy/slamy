import type {
  SlackConversationInfo,
  SlackConversationMetadataResult,
  SlackCreateConversationInput,
  SlackGetConversationInfoInput,
  SlackInviteToConversationInput,
  SlackPublicConversation,
  SlackSetConversationPurposeInput,
  SlackSetConversationTopicInput,
  WorkspaceSlackOperations,
} from "../slack/adapter.js";
import type { SlackWorkspaceContext } from "../slack/workspace-context.js";
import { callLocalSessionBroker } from "./local-session-broker.js";
import type {
  LocalSessionConnection,
  LocalSessionRequest,
} from "./local-session-web-client.js";

const MAX_CHANNEL_PAGES = 100;

export function createLocalSessionChannelOperations(
  connection: LocalSessionConnection,
  request: LocalSessionRequest = callLocalSessionBroker,
): WorkspaceSlackOperations {
  const call = (method: string, args: Readonly<Record<string, unknown>>) =>
    request(connection, method, args);
  const listAll = async (isPrivate: boolean): Promise<readonly SlackPublicConversation[]> => {
    const channels: SlackPublicConversation[] = [];
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    let pages = 0;
    do {
      pages += 1;
      if (pages > MAX_CHANNEL_PAGES) {
        throw new Error("Local session channel pagination exceeded its safety limit");
      }
      const response = asRecord(
        await call("conversations.list", {
          types: isPrivate ? "private_channel" : "public_channel",
          limit: 200,
          exclude_archived: false,
          ...(cursor ? { cursor } : {}),
        }),
      );
      for (const item of asArray(response.channels)) channels.push(mapConversation(item));
      const metadata = optionalRecord(response.response_metadata);
      cursor = typeof metadata?.next_cursor === "string" && metadata.next_cursor
        ? metadata.next_cursor
        : undefined;
      if (cursor && seenCursors.has(cursor)) {
        throw new Error("Local session channel pagination repeated a cursor");
      }
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
    return Object.freeze(channels);
  };

  return Object.freeze({
    listAllPublicConversations: () => listAll(false),
    listAllPrivateConversations: () => listAll(true),
    createConversation: async (
      _context: SlackWorkspaceContext,
      input: SlackCreateConversationInput,
    ) => {
      const response = asRecord(
        await call("conversations.create", {
          name: input.name,
          is_private: input.isPrivate,
        }),
      );
      return mapConversation(response.channel);
    },
    inviteToConversation: async (
      _context: SlackWorkspaceContext,
      input: SlackInviteToConversationInput,
    ): Promise<void> => {
      await call("conversations.invite", {
        channel: input.channelId,
        users: input.userIds.join(","),
      });
    },
    setConversationPurpose: async (
      _context: SlackWorkspaceContext,
      input: SlackSetConversationPurposeInput,
    ): Promise<SlackConversationMetadataResult> => {
      const response = asRecord(
        await call("conversations.setPurpose", {
          channel: input.channelId,
          purpose: input.purpose,
        }),
      );
      return Object.freeze({
        channelId: input.channelId,
        value: stringValue(optionalRecord(response.channel)?.purpose?.value ?? input.purpose),
      });
    },
    setConversationTopic: async (
      _context: SlackWorkspaceContext,
      input: SlackSetConversationTopicInput,
    ): Promise<SlackConversationMetadataResult> => {
      const response = asRecord(
        await call("conversations.setTopic", {
          channel: input.channelId,
          topic: input.topic,
        }),
      );
      return Object.freeze({
        channelId: input.channelId,
        value: stringValue(optionalRecord(response.channel)?.topic?.value ?? input.topic),
      });
    },
    getConversationInfo: async (
      _context: SlackWorkspaceContext,
      input: SlackGetConversationInfoInput,
    ): Promise<SlackConversationInfo> => {
      const response = asRecord(
        await call("conversations.info", { channel: input.channelId }),
      );
      const channel = asRecord(response.channel);
      const basic = mapConversation(channel);
      return Object.freeze({
        ...basic,
        topic: stringValue(optionalRecord(channel.topic)?.value ?? ""),
        purpose: stringValue(optionalRecord(channel.purpose)?.value ?? ""),
      });
    },
  }) as unknown as WorkspaceSlackOperations;
}

function mapConversation(value: unknown): SlackPublicConversation {
  const channel = asRecord(value);
  return Object.freeze({
    channelId: stringValue(channel.id),
    name: stringValue(channel.name),
    isArchived: channel.is_archived === true,
    isPrivate: channel.is_private === true,
  });
}

function asRecord(value: unknown): Record<string, any> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Local session returned an invalid Slack response");
  }
  return value as Record<string, any>;
}

function optionalRecord(value: unknown): Record<string, any> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, any>
    : undefined;
}

function asArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error("Local session returned an invalid Slack response");
  return value;
}

function stringValue(value: unknown): string {
  if (typeof value !== "string") throw new Error("Local session returned an invalid Slack response");
  return value;
}
