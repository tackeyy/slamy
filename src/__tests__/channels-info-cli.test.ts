import { Command } from "commander";
import { afterEach, expect, it, vi } from "vitest";
import { registerChannelManagementCommands } from "../cli/channels.js";
const targetClient = vi.hoisted(() => vi.fn());
vi.mock("../cli/target-client.js", () => ({ createCliTargetClient: targetClient }));
afterEach(() => { process.exitCode = undefined; targetClient.mockReset(); });
function setup(mode: "json" | "plain" | "human", value: unknown) {
  const program = new Command().option("--json").option("--plain").option("--workspace <selector>");
  const readChannelInfo = vi.fn().mockResolvedValue(value);
  const writeOut = vi.fn(); const writeErr = vi.fn();
  registerChannelManagementCommands(program.command("channels"), program, { ensureChannel: vi.fn(), inviteChannel: vi.fn(), readChannelInfo, writeOut, writeErr });
  return { program, readChannelInfo, writeOut, writeErr, args: ["node", "slamy", ...(mode === "human" ? [] : [`--${mode}`]), "--workspace", "example", "channels", "info", "https://example.slack.com/archives/C012ABC"] };
}
it("routes the permalink and explicit workspace through the shared resolver", async () => {
  const t = setup("json", { id: "C012ABC", is_private: true, shared_team_ids: ["T012ABC"] });
  await t.program.parseAsync(t.args);
  expect(t.readChannelInfo).toHaveBeenCalledWith("https://example.slack.com/archives/C012ABC", "example");
  expect(JSON.parse(t.writeOut.mock.calls[0]![0])).toEqual({ id: "C012ABC", is_private: true, shared_team_ids: ["T012ABC"] });
});
it.each(["human", "plain"] as const)("shows missing flags and teams as unknown in %s", async (mode) => {
  const t = setup(mode, { id: "C012ABC" }); await t.program.parseAsync(t.args);
  expect(t.writeOut.mock.calls[0]![0]).toContain("unknown");
  expect(t.writeOut.mock.calls[0]![0]).not.toContain("false");
});
it("does not silently succeed when the API fails", async () => {
  const t = setup("json", {}); t.readChannelInfo.mockRejectedValue(new Error("channel_not_found"));
  await t.program.parseAsync(t.args);
  expect(process.exitCode).toBe(1); expect(t.writeOut).not.toHaveBeenCalled();
});

it.each([false, true])("default path resolves workspace and disposes the lease even on failure=%s", async (fails) => {
  const dispose = vi.fn();
  const getChannelSharingInfo = fails ? vi.fn().mockRejectedValue(new Error("fixture")) : vi.fn().mockResolvedValue({ id: "C012ABC" });
  targetClient.mockResolvedValue({ client: { getChannelSharingInfo }, target: { channel: "C012ABC" }, dispose });
  const program = new Command().option("--json").option("--workspace <selector>");
  const writeOut = vi.fn();
  registerChannelManagementCommands(program.command("channels"), program, { ensureChannel: vi.fn(), inviteChannel: vi.fn(), writeOut, writeErr: vi.fn() });
  await program.parseAsync(["node", "slamy", "--json", "--workspace", "example", "channels", "info", "https://example.slack.com/archives/C012ABC"]);
  expect(targetClient).toHaveBeenCalledWith({ input: "https://example.slack.com/archives/C012ABC", explicitWorkspace: "example" });
  expect(getChannelSharingInfo).toHaveBeenCalledWith("C012ABC");
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(writeOut).toHaveBeenCalledTimes(fails ? 0 : 1);
});
