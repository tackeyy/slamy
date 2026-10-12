import { beforeEach, describe, expect, it, vi } from "vitest";
import { SlamyClient } from "../client.js";
const info = vi.hoisted(() => vi.fn());
vi.mock("@slack/web-api", () => ({
  WebClient: vi.fn(function () { return { conversations: { info } }; }),
  LogLevel: { ERROR: "error" },
}));
beforeEach(() => { info.mockReset(); });
const client = () => new SlamyClient({ userToken: "fixture" });
describe("channel sharing metadata", () => {
  it("returns only sharing metadata and preserves Enterprise host IDs", async () => {
    const channel = { id: "C012ABC", name: "example", is_private: true, is_shared: true, is_ext_shared: true, is_org_shared: false, shared_team_ids: ["T012ABC", "T034DEF"], connected_team_ids: ["T034DEF"], context_team_id: "T012ABC", conversation_host_id: "E056GHI" };
    info.mockResolvedValue({ ok: true, channel: { ...channel, topic: { value: "private discussion" }, latest: { text: "private message" } } });
    expect(await client().getChannelSharingInfo("C012ABC")).toEqual(channel);
    expect(info).toHaveBeenCalledWith({ channel: "C012ABC" });
  });
  it("keeps missing fields unknown rather than declaring unshared/public", async () => {
    info.mockResolvedValue({ ok: true, channel: { id: "C012ABC" } });
    expect(await client().getChannelSharingInfo("C012ABC")).toEqual({ id: "C012ABC" });
  });
  it.each([false, undefined, null])("rejects missing or wrong channel identity: %s", async (channel) => {
    info.mockResolvedValue({ ok: true, channel });
    await expect(client().getChannelSharingInfo("C012ABC")).rejects.toThrow("Invalid channel metadata");
  });
  it("rejects a different channel ID", async () => {
    info.mockResolvedValue({ ok: true, channel: { id: "C999XYZ" } });
    await expect(client().getChannelSharingInfo("C012ABC")).rejects.toThrow("Invalid channel metadata");
  });
  it.each(["is_private", "is_shared", "is_ext_shared", "is_org_shared"])("does not coerce %s", async (field) => {
    info.mockResolvedValue({ ok: true, channel: { id: "C012ABC", [field]: "false" } });
    await expect(client().getChannelSharingInfo("C012ABC")).rejects.toThrow("Invalid channel metadata");
  });
  it.each(["shared_team_ids", "connected_team_ids"])("rejects malformed %s", async (field) => {
    info.mockResolvedValue({ ok: true, channel: { id: "C012ABC", [field]: ["T012ABC", "not-a-team"] } });
    await expect(client().getChannelSharingInfo("C012ABC")).rejects.toThrow("Invalid channel metadata");
  });
  it("propagates API failures without another API call", async () => {
    info.mockRejectedValue(new Error("channel_not_found"));
    await expect(client().getChannelSharingInfo("C012ABC")).rejects.toThrow("channel_not_found");
    expect(info).toHaveBeenCalledTimes(1);
  });
});
