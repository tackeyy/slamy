import type { EnsureChannelResult } from "../commands/channel-management.js";

export type ChannelManagementOutputMode = "human" | "json" | "plain";

export function formatEnsureChannelResult(
  result: EnsureChannelResult,
  mode: ChannelManagementOutputMode,
): string {
  if (mode === "json") return JSON.stringify(result, null, 2);
  if (mode === "plain") {
    return [
      result.status,
      result.teamId,
      result.workspace,
      result.channelId ?? "",
      result.name,
      result.isPrivate ? "private" : "public",
      result.topic,
      result.purpose,
    ].join("\t");
  }
  const id = result.channelId ? ` (${result.channelId})` : "";
  return `${result.status}: #${result.name}${id} in ${result.workspace} [${result.isPrivate ? "private" : "public"}]`;
}
