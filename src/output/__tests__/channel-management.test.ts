import { describe, expect, it } from "vitest";
import { formatInviteToChannelResult, formatRenameChannelResult } from "../channel-management.js";

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
