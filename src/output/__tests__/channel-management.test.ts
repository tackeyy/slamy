import { describe, expect, it } from "vitest";
import { parseTeamId } from "../../domain/team-id.js";
import {
  formatInviteSharedToChannelResult,
  formatInviteToChannelResult,
  formatRenameChannelResult,
} from "../channel-management.js";

const result = {
  status: "invited",
  channelId: "C0123ABC",
  invited: ["U00000001"],
  alreadyInChannel: ["W00000002"],
} as const;

describe("formatInviteToChannelResult", () => {
  it("formats JSON output as the documented result object", () => {
    expect(JSON.parse(formatInviteToChannelResult(result, "json"))).toEqual(result);
  });

  it("formats plain output as stable tab-separated fields", () => {
    expect(formatInviteToChannelResult(result, "plain")).toBe(
      "invited\tC0123ABC\tU00000001\tW00000002",
    );
  });

  it("formats human output with both membership classifications", () => {
    expect(formatInviteToChannelResult(result, "human")).toBe(
      "invited: C0123ABC invited=U00000001 already_in_channel=W00000002",
    );
  });
});

describe("formatInviteSharedToChannelResult", () => {
  const sharedResult = {
    status: "invited" as const,
    teamId: parseTeamId("T00000001"),
    workspace: "wedgeai",
    channelId: "C0123ABC",
    emails: ["advisor@example.com"],
    externalLimited: true,
    inviteId: "I0123ABC",
  };

  it("formats JSON, plain, and human output without Slack join secrets", () => {
    for (const mode of ["json", "plain", "human"] as const) {
      const output = formatInviteSharedToChannelResult(sharedResult, mode);
      expect(output).not.toContain("url");
      expect(output).not.toContain("conf_code");
    }
    expect(JSON.parse(formatInviteSharedToChannelResult(sharedResult, "json"))).toEqual(sharedResult);
    expect(formatInviteSharedToChannelResult(sharedResult, "plain")).toBe(
      "invited\tT00000001\twedgeai\tC0123ABC\tadvisor@example.com\tlimited\tI0123ABC",
    );
    expect(formatInviteSharedToChannelResult(sharedResult, "human")).toBe(
      "invited: C0123ABC in wedgeai recipients=advisor@example.com access=limited",
    );
  });
});

describe("formatRenameChannelResult", () => {
  const renamed = {
    status: "renamed" as const, channelId: "C0123ABC", name: "001-general", previousName: "01-general",
  };

  it("formats the result in JSON, plain, and human modes", () => {
    expect(JSON.parse(formatRenameChannelResult(renamed, "json"))).toEqual(renamed);
    expect(formatRenameChannelResult(renamed, "plain")).toBe("renamed\tC0123ABC\t001-general\t01-general");
    expect(formatRenameChannelResult(renamed, "human")).toBe("renamed: #01-general (C0123ABC) -> #001-general");
  });
});
