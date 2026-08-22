import type {
  EnsureChannelResult,
  InviteToChannelResult,
} from "../commands/channel-management.js";

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

export function formatInviteToChannelResult(
  result: InviteToChannelResult,
  mode: ChannelManagementOutputMode,
): string {
  if (mode === "json") return JSON.stringify(result, null, 2);
  if (mode === "plain") {
    return [
      result.status,
      result.channelId,
      result.invited.join(","),
      result.alreadyInChannel.join(","),
    ].join("\t");
  }
  const invited = result.invited.length > 0 ? result.invited.join(", ") : "none";
  const already = result.alreadyInChannel.length > 0
    ? result.alreadyInChannel.join(", ")
    : "none";
  return `${result.status}: ${result.channelId} invited=${invited} already_in_channel=${already}`;
}
