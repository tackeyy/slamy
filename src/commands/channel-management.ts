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

type ChannelMismatchField = "name" | "isPrivate" | "topic" | "purpose";

export class ChannelEnsureError extends Error {
  readonly stage: "configure" | "verify-fetch" | "verify-mismatch";
  readonly channelId: string;
  readonly status: "created" | "existing";
  readonly mismatchedFields: readonly ChannelMismatchField[];

  constructor(
    stage: "configure" | "verify-fetch" | "verify-mismatch",
    channelId: string,
    status: "created" | "existing",
    mismatchedFields: readonly ChannelMismatchField[] = [],
  ) {
    super(channelEnsureErrorMessage(stage, mismatchedFields));
    this.name = "ChannelEnsureError";
    this.stage = stage;
    this.channelId = channelId;
    this.status = status;
    this.mismatchedFields = Object.freeze([...mismatchedFields]);
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
    throw new ChannelEnsureError("verify-fetch", channelId, status);
  }
  const mismatchedFields: ChannelMismatchField[] = [];
  if (verified.name !== input.name) mismatchedFields.push("name");
  if (verified.isPrivate !== input.isPrivate) mismatchedFields.push("isPrivate");
  if (restoreSlackEscapes(verified.topic) !== input.topic) mismatchedFields.push("topic");
  if (restoreSlackEscapes(verified.purpose) !== input.purpose) mismatchedFields.push("purpose");
  if (mismatchedFields.length > 0) {
    throw new ChannelEnsureError("verify-mismatch", channelId, status, mismatchedFields);
  }
}

function channelEnsureErrorMessage(
  stage: ChannelEnsureError["stage"],
  mismatchedFields: readonly string[],
): string {
  if (stage === "configure") {
    return "Slack channel configure failed after the channel target was resolved";
  }
  if (stage === "verify-fetch") {
    return "Slack channel verify failed after the channel target was resolved: could not read the channel";
  }
  return `Slack channel verify failed after the channel target was resolved: mismatched ${mismatchedFields.join(", ")}`;
}

function restoreSlackEscapes(value: string): string {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
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
