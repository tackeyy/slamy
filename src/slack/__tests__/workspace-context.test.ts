import { describe, expect, it } from "vitest";
import { parseTeamId } from "../../domain/team-id.js";
import type {
  CredentialKind,
  VerifiedCredential,
  VerifiedCredentialSet,
} from "../../credentials/types.js";
import { SlackAdapterError } from "../errors.js";
import { createSlackWorkspaceContext } from "../workspace-context.js";

const primary = parseTeamId("T00000001");
const secondary = parseTeamId("T00000002");

describe("createSlackWorkspaceContext", () => {
  it("creates an immutable context from a Team-matched verified credential set", () => {
    const credentials = credentialSet(primary, ["user", "bot"]);
    const context = createSlackWorkspaceContext({ teamId: primary, credentials });

    expect(context.teamId).toBe(primary);
    expect(context.credentials).toBe(credentials);
    expect(Object.isFrozen(context)).toBe(true);
  });

  it("rejects a credential set or member from another Team without reading token values", () => {
    const mismatchedSet = credentialSet(secondary, ["user"]);
    expect(() =>
      createSlackWorkspaceContext({ teamId: primary, credentials: mismatchedSet }),
    ).toThrowError(expect.objectContaining({ code: "WORKSPACE_CONTEXT_MISMATCH" }));

    const poisoned = credentialSet(primary, ["user"]);
    const mismatchedUser = credential("user", secondary);
    const memberMismatch = { ...poisoned, user: mismatchedUser };
    expect(() =>
      createSlackWorkspaceContext({ teamId: primary, credentials: memberMismatch }),
    ).toThrowError(expect.objectContaining({ code: "WORKSPACE_CONTEXT_MISMATCH" }));
  });

  it("uses a fixed secret-safe error surface", () => {
    const error = new SlackAdapterError({
      code: "WORKSPACE_CONTEXT_MISMATCH",
      message: "Slack workspace context does not match its verified credentials",
      requestId: "unavailable",
      method: "auth.test",
      teamId: primary,
      credentialKind: "user",
    });
    expect(error.toJSON()).toEqual({
      name: "SlackAdapterError",
      code: "WORKSPACE_CONTEXT_MISMATCH",
      message: "Slack workspace context does not match its verified credentials",
      requestId: "unavailable",
      method: "auth.test",
      teamId: primary,
      credentialKind: "user",
    });
  });
});

function credentialSet(
  teamId: ReturnType<typeof parseTeamId>,
  kinds: readonly CredentialKind[],
): VerifiedCredentialSet {
  return Object.freeze({
    teamId,
    ...(kinds.includes("user") ? { user: credential("user", teamId) } : {}),
    ...(kinds.includes("bot") ? { bot: credential("bot", teamId) } : {}),
    requiredScopes: Object.freeze({}),
    destroy() {},
  });
}

function credential(
  kind: CredentialKind,
  teamId: ReturnType<typeof parseTeamId>,
): VerifiedCredential {
  return Object.freeze({
    kind,
    teamId,
    use<Result>(consumer: (token: string) => Result): Result {
      return consumer(`xox${kind === "bot" ? "b" : "p"}-secret-canary`);
    },
    destroy() {},
  });
}
