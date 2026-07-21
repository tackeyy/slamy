declare const teamIdBrand: unique symbol;

export type TeamId = string & { readonly [teamIdBrand]: "TeamId" };

const TEAM_ID_PATTERN = /^T[A-Z0-9]+$/;

export function parseTeamId(value: unknown): TeamId {
  if (typeof value !== "string" || !TEAM_ID_PATTERN.test(value)) {
    throw new Error("Invalid Slack Team ID");
  }
  return value as TeamId;
}
