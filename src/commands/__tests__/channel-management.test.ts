import { describe, expect, it, vi } from "vitest";
import { parseTeamId } from "../../domain/team-id.js";
import type { WorkspaceSlackOperations } from "../../slack/index.js";
import { contextWith } from "../../slack/__tests__/helpers.js";
import {
  ChannelEnsureError,
  ensureChannel,
  inviteSharedToChannel,
  inviteToChannel,
  renameChannel,
} from "../channel-management.js";

describe("renameChannel", () => {
  it("returns a plan without resolving credentials or calling Slack", async () => {
    const loadRuntime = vi.fn();

    await expect(renameChannel({ channelId: "C0123ABC", name: "001-general", dryRun: true }, loadRuntime))
      .resolves.toEqual({ status: "planned", channelId: "C0123ABC", name: "001-general" });
    expect(loadRuntime).not.toHaveBeenCalled();
  });

  it("renames a public channel and verifies the returned name", async () => {
    const renameConversation = vi.fn().mockResolvedValue(undefined);
    const slack = {
      listAllPublicConversations: vi.fn().mockResolvedValue([
        { channelId: "C0123ABC", name: "01-general", isArchived: false, isPrivate: false },
      ]),
      listAllPrivateConversations: vi.fn().mockResolvedValue([]),
      renameConversation,
      getConversationInfo: vi.fn().mockResolvedValue({ name: "001-general" }),
    } as unknown as WorkspaceSlackOperations;

    await expect(renameChannel({ channelId: "C0123ABC", name: "001-general", dryRun: false }, runtime(slack)))
      .resolves.toEqual({
        status: "renamed", channelId: "C0123ABC", name: "001-general", previousName: "01-general",
      });
    expect(renameConversation).toHaveBeenCalledWith(expect.anything(), {
      channelId: "C0123ABC", name: "001-general", isPrivate: false,
    });
  });

  it("renames a private channel using the private visibility operation", async () => {
    const renameConversation = vi.fn().mockResolvedValue(undefined);
    const slack = {
      listAllPublicConversations: vi.fn().mockResolvedValue([]),
      listAllPrivateConversations: vi.fn().mockResolvedValue([
        { channelId: "C0123ABC", name: "01-private", isArchived: false, isPrivate: true },
      ]),
      renameConversation,
      getConversationInfo: vi.fn().mockResolvedValue({ name: "001-private" }),
    } as unknown as WorkspaceSlackOperations;

    await expect(renameChannel(
      { channelId: "C0123ABC", name: "001-private", dryRun: false },
      runtime(slack),
    )).resolves.toEqual({
      status: "renamed", channelId: "C0123ABC", name: "001-private", previousName: "01-private",
    });
    expect(renameConversation).toHaveBeenCalledWith(expect.anything(), {
      channelId: "C0123ABC", name: "001-private", isPrivate: true,
    });
  });

  it("renames a G-prefixed private channel using the private visibility operation", async () => {
    const renameConversation = vi.fn().mockResolvedValue(undefined);
    const slack = {
      listAllPublicConversations: vi.fn().mockResolvedValue([]),
      listAllPrivateConversations: vi.fn().mockResolvedValue([
        { channelId: "G0123ABC", name: "01-private", isArchived: false, isPrivate: true },
      ]),
      renameConversation,
      getConversationInfo: vi.fn().mockResolvedValue({ name: "001-private" }),
    } as unknown as WorkspaceSlackOperations;

    await expect(renameChannel(
      { channelId: "G0123ABC", name: "001-private", dryRun: false },
      runtime(slack),
    )).resolves.toMatchObject({ status: "renamed", channelId: "G0123ABC" });
    expect(renameConversation).toHaveBeenCalledWith(expect.anything(), {
      channelId: "G0123ABC", name: "001-private", isPrivate: true,
    });
  });

  it("does not call Slack rename when the requested name is already current", async () => {
    const renameConversation = vi.fn();
    const slack = {
      listAllPublicConversations: vi.fn().mockResolvedValue([
        { channelId: "C0123ABC", name: "001-general", isArchived: false, isPrivate: false },
      ]),
      listAllPrivateConversations: vi.fn().mockResolvedValue([]),
      renameConversation,
    } as unknown as WorkspaceSlackOperations;

    await expect(renameChannel({ channelId: "C0123ABC", name: "001-general", dryRun: false }, runtime(slack)))
      .resolves.toEqual({
        status: "unchanged", channelId: "C0123ABC", name: "001-general", previousName: "001-general",
      });
    expect(renameConversation).not.toHaveBeenCalled();
  });

  it.each([
    ["missing channel", [], "Channel not found in the selected workspace"],
    ["duplicate name", [
      { channelId: "C0123ABC", name: "01-general", isArchived: false, isPrivate: false },
      { channelId: "C0456DEF", name: "001-general", isArchived: true, isPrivate: false },
    ], "Another channel already uses the requested name"],
  ])("rejects %s without calling rename", async (_caseName, channels, message) => {
    const renameConversation = vi.fn();
    const slack = {
      listAllPublicConversations: vi.fn().mockResolvedValue(channels),
      listAllPrivateConversations: vi.fn().mockResolvedValue([]),
      renameConversation,
    } as unknown as WorkspaceSlackOperations;

    await expect(renameChannel({ channelId: "C0123ABC", name: "001-general", dryRun: false }, runtime(slack)))
      .rejects.toThrow(message);
    expect(renameConversation).not.toHaveBeenCalled();
  });

  it("rejects when the name read back after rename differs", async () => {
    const slack = {
      listAllPublicConversations: vi.fn().mockResolvedValue([
        { channelId: "C0123ABC", name: "01-general", isArchived: false, isPrivate: false },
      ]),
      listAllPrivateConversations: vi.fn().mockResolvedValue([]),
      renameConversation: vi.fn().mockResolvedValue(undefined),
      getConversationInfo: vi.fn().mockResolvedValue({ name: "unexpected-name" }),
    } as unknown as WorkspaceSlackOperations;

    await expect(renameChannel({ channelId: "C0123ABC", name: "001-general", dryRun: false }, runtime(slack)))
      .rejects.toThrow("Slack channel rename verification did not match the requested name");
  });

  it("rejects with a distinct verification error when reading the renamed channel fails", async () => {
    const slack = {
      listAllPublicConversations: vi.fn().mockResolvedValue([
        { channelId: "C0123ABC", name: "01-general", isArchived: false, isPrivate: false },
      ]),
      listAllPrivateConversations: vi.fn().mockResolvedValue([]),
      renameConversation: vi.fn().mockResolvedValue(undefined),
      getConversationInfo: vi.fn().mockRejectedValue(new Error("read failed")),
    } as unknown as WorkspaceSlackOperations;

    await expect(renameChannel({ channelId: "C0123ABC", name: "001-general", dryRun: false }, runtime(slack)))
      .rejects.toThrow("Slack channel rename verification could not read the channel");
  });

  it.each([
    ["renamed", "01-general", "001-general", "renamed"],
    ["unchanged", "001-general", "001-general", "unchanged"],
  ] as const)("disposes the runtime once after %s", async (_caseName, previousName, name, status) => {
    const dispose = vi.fn();
    const slack = {
      listAllPublicConversations: vi.fn().mockResolvedValue([
        { channelId: "C0123ABC", name: previousName, isArchived: false, isPrivate: false },
      ]),
      listAllPrivateConversations: vi.fn().mockResolvedValue([]),
      renameConversation: vi.fn().mockResolvedValue(undefined),
      getConversationInfo: vi.fn().mockResolvedValue({ name }),
    } as unknown as WorkspaceSlackOperations;

    await expect(renameChannel(
      { channelId: "C0123ABC", name, dryRun: false },
      runtime(slack, dispose),
    )).resolves.toMatchObject({ status });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes the runtime once after a rename error", async () => {
    const dispose = vi.fn();
    const slack = {
      listAllPublicConversations: vi.fn().mockResolvedValue([]),
      listAllPrivateConversations: vi.fn().mockResolvedValue([]),
    } as unknown as WorkspaceSlackOperations;

    await expect(renameChannel(
      { channelId: "C0123ABC", name: "001-general", dryRun: false },
      runtime(slack, dispose),
    )).rejects.toThrow("Channel not found in the selected workspace");
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

function runtime(slack: WorkspaceSlackOperations, dispose = vi.fn()) {
  return async () => ({ context: contextWith({ userToken: "xoxp-user" }), slack, dispose });
}

describe("ensureChannel", () => {
  it("returns a plan without resolving credentials or calling Slack", async () => {
    const loadRuntime = vi.fn();

    await expect(
      ensureChannel(
        {
          workspace: {
            teamId: parseTeamId("T00000001"),
            alias: "wedgeai",
            domain: "wedgeai.slack.com",
            displayName: "Wedge AI, Inc.",
          },
          name: "01-engineering",
          isPrivate: false,
          topic: "AI・開発",
          purpose: "AI・ソフトウェア開発と技術判断を共有します。",
          dryRun: true,
        },
        loadRuntime,
      ),
    ).resolves.toEqual({
      status: "planned",
      teamId: "T00000001",
      workspace: "wedgeai",
      name: "01-engineering",
      isPrivate: false,
      topic: "AI・開発",
      purpose: "AI・ソフトウェア開発と技術判断を共有します。",
    });
    expect(loadRuntime).not.toHaveBeenCalled();
  });

  it("reuses an existing channel and updates its metadata without creating a duplicate", async () => {
    const createConversation = vi.fn();
    const setConversationPurpose = vi.fn().mockResolvedValue({});
    const setConversationTopic = vi.fn().mockResolvedValue({});
    const getConversationInfo = vi.fn().mockResolvedValue({
      channelId: "C0123ABC",
      name: "01-engineering",
      isArchived: false,
      isPrivate: false,
      topic: "AI・開発",
      purpose: "AI・ソフトウェア開発と技術判断を共有します。",
    });
    const dispose = vi.fn();
    const slack = {
      listAllPublicConversations: vi.fn().mockResolvedValue([
        {
          channelId: "C0123ABC",
          name: "01-engineering",
          isArchived: false,
          isPrivate: false,
        },
      ]),
      listAllPrivateConversations: vi.fn().mockResolvedValue([]),
      createConversation,
      setConversationPurpose,
      setConversationTopic,
      getConversationInfo,
    } as unknown as WorkspaceSlackOperations;

    await expect(
      ensureChannel(channelInput(), async () => ({
        context: contextWith({ userToken: "xoxp-user" }),
        slack,
        dispose,
      })),
    ).resolves.toMatchObject({ status: "existing", channelId: "C0123ABC" });
    expect(createConversation).not.toHaveBeenCalled();
    expect(setConversationPurpose).toHaveBeenCalledWith(expect.anything(), {
      channelId: "C0123ABC",
      purpose: "AI・ソフトウェア開発と技術判断を共有します。",
      isPrivate: false,
    });
    expect(setConversationTopic).toHaveBeenCalledTimes(1);
    expect(getConversationInfo).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("creates a missing channel, configures it, and verifies the final state", async () => {
    const createConversation = vi.fn().mockResolvedValue({
      channelId: "C0999XYZ",
      name: "01-engineering",
      isArchived: false,
      isPrivate: false,
    });
    const dispose = vi.fn();
    const slack = {
      listAllPublicConversations: vi.fn().mockResolvedValue([]),
      listAllPrivateConversations: vi.fn().mockResolvedValue([]),
      createConversation,
      setConversationPurpose: vi.fn().mockResolvedValue({}),
      setConversationTopic: vi.fn().mockResolvedValue({}),
      getConversationInfo: vi.fn().mockResolvedValue({
        channelId: "C0999XYZ",
        name: "01-engineering",
        isArchived: false,
        isPrivate: false,
        topic: "AI・開発",
        purpose: "AI・ソフトウェア開発と技術判断を共有します。",
      }),
    } as unknown as WorkspaceSlackOperations;

    await expect(
      ensureChannel(channelInput(), async () => ({
        context: contextWith({ userToken: "xoxp-user" }),
        slack,
        dispose,
      })),
    ).resolves.toMatchObject({ status: "created", channelId: "C0999XYZ" });
    expect(createConversation).toHaveBeenCalledWith(expect.anything(), {
      name: "01-engineering",
      isPrivate: false,
    });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("accepts Slack-escaped topic and purpose metadata during verification", async () => {
    const slack = {
      listAllPublicConversations: vi.fn().mockResolvedValue([]),
      listAllPrivateConversations: vi.fn().mockResolvedValue([]),
      createConversation: vi.fn().mockResolvedValue({
        channelId: "C0999XYZ",
        name: "01-engineering",
        isArchived: false,
        isPrivate: false,
      }),
      setConversationPurpose: vi.fn().mockResolvedValue({}),
      setConversationTopic: vi.fn().mockResolvedValue({}),
      getConversationInfo: vi.fn().mockResolvedValue({
        channelId: "C0999XYZ",
        name: "01-engineering",
        isArchived: false,
        isPrivate: false,
        topic: "AI&amp;開発 &lt;速報&gt;",
        purpose: "AI&amp;ソフトウェア開発と技術判断を共有します。&lt;内部&gt; &gt;",
      }),
    } as unknown as WorkspaceSlackOperations;

    await expect(
      ensureChannel(
        {
          ...channelInput(),
          topic: "AI&開発 <速報>",
          purpose: "AI&ソフトウェア開発と技術判断を共有します。<内部> >",
        },
        async () => ({
          context: contextWith({ userToken: "xoxp-user" }),
          slack,
          dispose() {},
        }),
      ),
    ).resolves.toMatchObject({ status: "created", channelId: "C0999XYZ" });
  });

  it("reports only topic when verified metadata differs", async () => {
    const slack = verificationSlack({ topic: "異なる topic" });

    await expect(
      ensureChannel(channelInput(), async () => ({
        context: contextWith({ userToken: "xoxp-user" }),
        slack,
        dispose() {},
      })),
    ).rejects.toMatchObject({
      stage: "verify-mismatch",
      channelId: "C0999XYZ",
      status: "created",
      mismatchedFields: ["topic"],
      message: "Slack channel verify failed after the channel target was resolved: mismatched topic",
    });
  });

  it("reports only purpose when verified metadata differs", async () => {
    const slack = verificationSlack({ purpose: "異なる purpose" });

    await expect(
      ensureChannel(channelInput(), async () => ({
        context: contextWith({ userToken: "xoxp-user" }),
        slack,
        dispose() {},
      })),
    ).rejects.toMatchObject({
      stage: "verify-mismatch",
      mismatchedFields: ["purpose"],
      message: "Slack channel verify failed after the channel target was resolved: mismatched purpose",
    });
  });

  it("restores double-escaped metadata by exactly one level", async () => {
    const slack = verificationSlack({
      purpose: "AI&amp;amp;ソフトウェア開発と技術判断を共有します。",
    });

    await expect(
      ensureChannel(
        { ...channelInput(), purpose: "AI&amp;ソフトウェア開発と技術判断を共有します。" },
        async () => ({
          context: contextWith({ userToken: "xoxp-user" }),
          slack,
          dispose() {},
        }),
      ),
    ).resolves.toMatchObject({ status: "created", channelId: "C0999XYZ" });
  });

  it("keeps literal entity text in the input after restoring one level", async () => {
    const slack = verificationSlack({
      topic: "&amp;lt;tag&amp;gt;",
      purpose: "AI&amp;lt;ソフトウェア開発と技術判断を共有します。",
    });

    await expect(
      ensureChannel(
        {
          ...channelInput(),
          topic: "&lt;tag&gt;",
          purpose: "AI&lt;ソフトウェア開発と技術判断を共有します。",
        },
        async () => ({
          context: contextWith({ userToken: "xoxp-user" }),
          slack,
          dispose() {},
        }),
      ),
    ).resolves.toMatchObject({ status: "created", channelId: "C0999XYZ" });
  });

  it("does not restore double-escaped metadata by two levels", async () => {
    const slack = verificationSlack({
      purpose: "AI&amp;amp;ソフトウェア開発と技術判断を共有します。",
    });

    await expect(
      ensureChannel(channelInput(), async () => ({
        context: contextWith({ userToken: "xoxp-user" }),
        slack,
        dispose() {},
      })),
    ).rejects.toMatchObject({
      stage: "verify-mismatch",
      mismatchedFields: ["purpose"],
    });
  });

  it("reports every differing verification field without exposing values", async () => {
    const slack = verificationSlack({
      name: "different-channel",
      isPrivate: true,
      topic: "異なる topic",
      purpose: "異なる purpose",
    });

    await expect(
      ensureChannel(channelInput(), async () => ({
        context: contextWith({ userToken: "xoxp-user" }),
        slack,
        dispose() {},
      })),
    ).rejects.toMatchObject({
      stage: "verify-mismatch",
      mismatchedFields: ["name", "isPrivate", "topic", "purpose"],
      message: "Slack channel verify failed after the channel target was resolved: mismatched name, isPrivate, topic, purpose",
    });
  });

  it("reports verification fetch failures separately from mismatches", async () => {
    const slack = verificationSlack({});
    (slack.getConversationInfo as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Slack API unavailable"),
    );

    await expect(
      ensureChannel(channelInput(), async () => ({
        context: contextWith({ userToken: "xoxp-user" }),
        slack,
        dispose() {},
      })),
    ).rejects.toMatchObject({
      stage: "verify-fetch",
      mismatchedFields: [],
      message: "Slack channel verify failed after the channel target was resolved: could not read the channel",
    });
  });

  it("reports the created channel id when metadata configuration fails", async () => {
    const slack = {
      listAllPublicConversations: vi.fn().mockResolvedValue([]),
      listAllPrivateConversations: vi.fn().mockResolvedValue([]),
      createConversation: vi.fn().mockResolvedValue({
        channelId: "C0999XYZ",
        name: "01-engineering",
        isArchived: false,
        isPrivate: false,
      }),
      setConversationPurpose: vi.fn().mockRejectedValue(new Error("raw secret canary")),
    } as unknown as WorkspaceSlackOperations;

    let caught: unknown;
    try {
      await ensureChannel(channelInput(), async () => ({
        context: contextWith({ userToken: "xoxp-user" }),
        slack,
        dispose() {},
      }));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ChannelEnsureError);
    expect(caught).toMatchObject({
      stage: "configure",
      channelId: "C0999XYZ",
      status: "created",
    });
    expect(String(caught)).not.toContain("raw secret canary");
  });
});

describe("inviteToChannel", () => {
  it("returns a plan without resolving credentials or calling Slack", async () => {
    const loadRuntime = vi.fn();

    await expect(
      inviteToChannel(
        {
          workspace: {
            teamId: parseTeamId("T00000001"),
            alias: "wedgeai",
            domain: "wedgeai.slack.com",
            displayName: "Wedge AI, Inc.",
          },
          channelId: "C0123ABC",
          userIds: ["U00000001", "W00000002"],
          dryRun: true,
        },
        loadRuntime,
      ),
    ).resolves.toEqual({
      status: "planned",
      channelId: "C0123ABC",
      invited: ["U00000001", "W00000002"],
      alreadyInChannel: [],
    });
    expect(loadRuntime).not.toHaveBeenCalled();
  });

  it("invites each requested user and disposes the runtime", async () => {
    const inviteToConversation = vi.fn().mockResolvedValue({});
    const dispose = vi.fn();
    const slack = { inviteToConversation } as unknown as WorkspaceSlackOperations;

    await expect(
      inviteToChannel(inviteInput(), async () => ({
        context: contextWith({ userToken: "xoxp-user" }),
        slack,
        dispose,
      })),
    ).resolves.toEqual({
      status: "invited",
      channelId: "C0123ABC",
      invited: ["U00000001", "W00000002"],
      alreadyInChannel: [],
    });
    expect(inviteToConversation).toHaveBeenNthCalledWith(1, expect.anything(), {
      channelId: "C0123ABC",
      userIds: ["U00000001"],
    });
    expect(inviteToConversation).toHaveBeenNthCalledWith(2, expect.anything(), {
      channelId: "C0123ABC",
      userIds: ["W00000002"],
    });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("classifies already-in-channel users while inviting the remaining users", async () => {
    const alreadyInChannel = Object.assign(new Error("Slack API failed"), {
      platformCode: "already_in_channel",
    });
    const inviteToConversation = vi.fn()
      .mockRejectedValueOnce(alreadyInChannel)
      .mockResolvedValueOnce({});
    const slack = { inviteToConversation } as unknown as WorkspaceSlackOperations;

    await expect(
      inviteToChannel(inviteInput(), async () => ({
        context: contextWith({ userToken: "xoxp-user" }),
        slack,
        dispose() {},
      })),
    ).resolves.toEqual({
      status: "invited",
      channelId: "C0123ABC",
      invited: ["W00000002"],
      alreadyInChannel: ["U00000001"],
    });
  });

  it("reports already_in_channel when every requested user is already a member", async () => {
    const alreadyInChannel = Object.assign(new Error("Slack API failed"), {
      platformCode: "already_in_channel",
    });
    const slack = {
      inviteToConversation: vi.fn().mockRejectedValue(alreadyInChannel),
    } as unknown as WorkspaceSlackOperations;

    await expect(
      inviteToChannel(inviteInput(), async () => ({
        context: contextWith({ userToken: "xoxp-user" }),
        slack,
        dispose() {},
      })),
    ).resolves.toMatchObject({
      status: "already_in_channel",
      invited: [],
      alreadyInChannel: ["U00000001", "W00000002"],
    });
  });

  it("propagates other Slack API errors and still disposes the runtime", async () => {
    const failure = Object.assign(new Error("Slack rejected the operation"), {
      platformCode: "user_not_found",
    });
    const dispose = vi.fn();
    const slack = {
      inviteToConversation: vi.fn().mockRejectedValue(failure),
    } as unknown as WorkspaceSlackOperations;

    await expect(
      inviteToChannel(inviteInput(), async () => ({
        context: contextWith({ userToken: "xoxp-user" }),
        slack,
        dispose,
      })),
    ).rejects.toBe(failure);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

function channelInput() {
  return {
    workspace: {
      teamId: parseTeamId("T00000001"),
      alias: "wedgeai",
      domain: "wedgeai.slack.com",
      displayName: "Wedge AI, Inc.",
    },
    name: "01-engineering",
    isPrivate: false,
    topic: "AI・開発",
    purpose: "AI・ソフトウェア開発と技術判断を共有します。",
    dryRun: false,
  } as const;
}

describe("inviteSharedToChannel", () => {
  it("returns a plan without resolving credentials or calling Slack", async () => {
    const loadRuntime = vi.fn();

    await expect(inviteSharedToChannel({
      workspace: channelInput().workspace,
      channelId: "C0123ABC",
      emails: ["advisor@example.com"],
      externalLimited: true,
      dryRun: true,
    }, loadRuntime)).resolves.toEqual({
      status: "planned", teamId: parseTeamId("T00000001"), workspace: "wedgeai",
      channelId: "C0123ABC", emails: ["advisor@example.com"], externalLimited: true,
    });
    expect(loadRuntime).not.toHaveBeenCalled();
  });

  it("invites all email recipients once, drops join secrets, and disposes the runtime", async () => {
    const inviteSharedToConversation = vi.fn().mockResolvedValue({
      inviteId: "I0123ABC",
      url: "https://slack.example/invite-secret",
      confCode: "conf-secret",
    });
    const dispose = vi.fn();
    const slack = { inviteSharedToConversation } as unknown as WorkspaceSlackOperations;

    await expect(
      inviteSharedToChannel(
        {
          workspace: channelInput().workspace,
          channelId: "C0123ABC",
          emails: ["advisor@example.com", "tax@example.com"],
          externalLimited: true,
          dryRun: false,
        },
        async () => ({ context: contextWith({ userToken: "xoxp-user" }), slack, dispose }),
      ),
    ).resolves.toEqual({
      status: "invited",
      teamId: parseTeamId("T00000001"),
      workspace: "wedgeai",
      channelId: "C0123ABC",
      emails: ["advisor@example.com", "tax@example.com"],
      externalLimited: true,
      inviteId: "I0123ABC",
    });
    expect(inviteSharedToConversation).toHaveBeenCalledWith(expect.anything(), {
      channelId: "C0123ABC",
      emails: ["advisor@example.com", "tax@example.com"],
      externalLimited: true,
    });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("passes full-access policy through as externalLimited false", async () => {
    const inviteSharedToConversation = vi.fn().mockResolvedValue({ inviteId: "I0123ABC" });
    const slack = { inviteSharedToConversation } as unknown as WorkspaceSlackOperations;

    await inviteSharedToChannel({
      workspace: channelInput().workspace, channelId: "C0123ABC", emails: ["advisor@example.com"],
      externalLimited: false, dryRun: false,
    }, async () => ({ context: contextWith({ userToken: "xoxp-user" }), slack, dispose() {} }));

    expect(inviteSharedToConversation).toHaveBeenCalledWith(expect.anything(), {
      channelId: "C0123ABC", emails: ["advisor@example.com"], externalLimited: false,
    });
  });

  it("propagates the platform error from the single invite call and disposes the runtime", async () => {
    const failure = Object.assign(new Error("Slack API failed"), { platformCode: "missing_scope" });
    const dispose = vi.fn();
    const slack = {
      inviteSharedToConversation: vi.fn().mockRejectedValue(failure),
    } as unknown as WorkspaceSlackOperations;

    await expect(inviteSharedToChannel({
      workspace: channelInput().workspace, channelId: "C0123ABC", emails: ["advisor@example.com"],
      externalLimited: true, dryRun: false,
    }, async () => ({ context: contextWith({ userToken: "xoxp-user" }), slack, dispose }))).rejects.toBe(failure);
    expect(slack.inviteSharedToConversation).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

function inviteInput() {
  return {
    workspace: channelInput().workspace,
    channelId: "C0123ABC",
    userIds: ["U00000001", "W00000002"],
    dryRun: false,
  } as const;
}

function verificationSlack(
  metadata: Partial<{
    readonly name: string;
    readonly isPrivate: boolean;
    readonly topic: string;
    readonly purpose: string;
  }>,
) {
  return {
    listAllPublicConversations: vi.fn().mockResolvedValue([]),
    listAllPrivateConversations: vi.fn().mockResolvedValue([]),
    createConversation: vi.fn().mockResolvedValue({
      channelId: "C0999XYZ",
      name: "01-engineering",
      isArchived: false,
      isPrivate: false,
    }),
    setConversationPurpose: vi.fn().mockResolvedValue({}),
    setConversationTopic: vi.fn().mockResolvedValue({}),
    getConversationInfo: vi.fn().mockResolvedValue({
      channelId: "C0999XYZ",
      name: "01-engineering",
      isArchived: false,
      isPrivate: false,
      topic: "AI・開発",
      purpose: "AI・ソフトウェア開発と技術判断を共有します。",
      ...metadata,
    }),
  } as unknown as WorkspaceSlackOperations;
}
