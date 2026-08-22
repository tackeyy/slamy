import type { TeamId } from "../domain/team-id.js";
import type { SlackWorkspaceContext, WorkspaceSlackOperations } from "../slack/index.js";

export type ChannelWorkspace = {
  readonly teamId: TeamId;
  readonly alias: string;
  readonly domain: string;
  readonly displayName: string;
};

export type EnsureChannelInput = {
  readonly workspace: ChannelWorkspace;
  readonly name: string;
  readonly isPrivate: boolean;
  readonly topic: string;
  readonly purpose: string;
  readonly dryRun: boolean;
};

export type ChannelRuntime = {
  readonly context: SlackWorkspaceContext;
  readonly slack: WorkspaceSlackOperations;
  dispose(): void;
};

export type ChannelRuntimeLoader = () => Promise<ChannelRuntime>;

export type EnsureChannelResult = {
  readonly status: "planned" | "created" | "existing";
  readonly teamId: TeamId;
  readonly workspace: string;
  readonly name: string;
  readonly isPrivate: boolean;
  readonly topic: string;
  readonly purpose: string;
  readonly channelId?: string;
};

export type InviteToChannelInput = {
  readonly workspace: ChannelWorkspace;
  readonly channelId: string;
  readonly userIds: readonly string[];
  readonly dryRun: boolean;
};

export type InviteToChannelResult = {
  readonly status: "planned" | "invited" | "already_in_channel";
  readonly channelId: string;
  readonly invited: readonly string[];
  readonly alreadyInChannel: readonly string[];
};

export class ChannelEnsureError extends Error {
  readonly stage: "configure" | "verify";
  readonly channelId: string;
  readonly status: "created" | "existing";

  constructor(
    stage: "configure" | "verify",
    channelId: string,
    status: "created" | "existing",
  ) {
    super(`Slack channel ${stage} failed after the channel target was resolved`);
    this.name = "ChannelEnsureError";
    this.stage = stage;
    this.channelId = channelId;
    this.status = status;
  }
}

export async function ensureChannel(
  input: EnsureChannelInput,
  loadRuntime: ChannelRuntimeLoader,
): Promise<EnsureChannelResult> {
  if (input.dryRun) return result(input, "planned");
  const runtime = await loadRuntime();
  try {
    const [publicChannels, privateChannels] = await Promise.all([
      runtime.slack.listAllPublicConversations(runtime.context),
      runtime.slack.listAllPrivateConversations(runtime.context),
    ]);
    const existing = [...publicChannels, ...privateChannels].find(
      (channel) => channel.name === input.name,
    );
    if (!existing) {
      const created = await runtime.slack.createConversation(runtime.context, {
        name: input.name,
        isPrivate: input.isPrivate,
      });
      await configureAndVerify(runtime, input, created.channelId, "created");
      return result(input, "created", created.channelId);
    }
    if (existing.isPrivate !== input.isPrivate) {
      throw new Error("An existing channel has the requested name with a different visibility");
    }

    await configureAndVerify(runtime, input, existing.channelId, "existing");
    return result(input, "existing", existing.channelId);
  } finally {
    runtime.dispose();
  }
}

export async function inviteToChannel(
  input: InviteToChannelInput,
  loadRuntime: ChannelRuntimeLoader,
): Promise<InviteToChannelResult> {
  if (input.dryRun) {
    return Object.freeze({
      status: "planned",
      channelId: input.channelId,
      invited: Object.freeze([...input.userIds]),
      alreadyInChannel: Object.freeze([]),
    });
  }
  const runtime = await loadRuntime();
  try {
    const invited: string[] = [];
    const alreadyInChannel: string[] = [];
    for (const userId of input.userIds) {
      try {
        await runtime.slack.inviteToConversation(runtime.context, {
          channelId: input.channelId,
          userIds: [userId],
        });
        invited.push(userId);
      } catch (error) {
        if (platformCode(error) !== "already_in_channel") throw error;
        alreadyInChannel.push(userId);
      }
    }
    return Object.freeze({
      status: invited.length > 0 ? "invited" : "already_in_channel",
      channelId: input.channelId,
      invited: Object.freeze(invited),
      alreadyInChannel: Object.freeze(alreadyInChannel),
    });
  } finally {
    runtime.dispose();
  }
}

function platformCode(error: unknown): unknown {
  return typeof error === "object" && error !== null && "platformCode" in error
    ? error.platformCode
    : undefined;
}

async function configureAndVerify(
  runtime: ChannelRuntime,
  input: EnsureChannelInput,
  channelId: string,
  status: "created" | "existing",
): Promise<void> {
  try {
    await runtime.slack.setConversationPurpose(runtime.context, {
      channelId,
      purpose: input.purpose,
      isPrivate: input.isPrivate,
    });
    await runtime.slack.setConversationTopic(runtime.context, {
      channelId,
      topic: input.topic,
      isPrivate: input.isPrivate,
    });
  } catch {
    throw new ChannelEnsureError("configure", channelId, status);
  }
  let verified;
  try {
    verified = await runtime.slack.getConversationInfo(runtime.context, {
      channelId,
      isPrivate: input.isPrivate,
    });
  } catch {
    throw new ChannelEnsureError("verify", channelId, status);
  }
  if (
    verified.name !== input.name ||
    verified.isPrivate !== input.isPrivate ||
    verified.topic !== input.topic ||
    verified.purpose !== input.purpose
  ) {
    throw new ChannelEnsureError("verify", channelId, status);
  }
}

function result(
  input: EnsureChannelInput,
  status: EnsureChannelResult["status"],
  channelId?: string,
): EnsureChannelResult {
  return Object.freeze({
    status,
    teamId: input.workspace.teamId,
    workspace: input.workspace.alias,
    name: input.name,
    isPrivate: input.isPrivate,
    topic: input.topic,
    purpose: input.purpose,
    ...(channelId ? { channelId } : {}),
  });
}
