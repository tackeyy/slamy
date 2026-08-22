import { describe, expect, it, vi } from "vitest";
import { parseTeamId } from "../../domain/team-id.js";
import type { WorkspaceSlackOperations } from "../../slack/index.js";
import { contextWith } from "../../slack/__tests__/helpers.js";
import {
  ChannelEnsureError,
  ensureChannel,
  inviteToChannel,
} from "../channel-management.js";

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

function inviteInput() {
  return {
    workspace: channelInput().workspace,
    channelId: "C0123ABC",
    userIds: ["U00000001", "W00000002"],
    dryRun: false,
  } as const;
}
