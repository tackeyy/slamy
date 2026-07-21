import { parseTeamId, type TeamId } from "../domain/team-id.js";
import type { WorkspaceRecord } from "../domain/workspace.js";
import type { AuthIdentity, AuthVerifier } from "./auth-verifier.js";
import { CredentialError } from "./errors.js";
import type { CredentialProvider, CredentialReference } from "./provider.js";
import {
  createCredentialSecret,
  type CredentialSecret,
} from "./secret.js";
import {
  type CredentialKind,
  type CredentialRequirement,
  type VerifiedCredentialSet,
} from "./types.js";
import {
  createVerifiedCredential,
  createVerifiedCredentialSet,
} from "./verified-credential.js";

type ReferenceByKind = Partial<Record<CredentialKind, CredentialReference>>;
type SecretByKind = Partial<Record<CredentialKind, CredentialSecret>>;
type IdentityByKind = Partial<Record<CredentialKind, AuthIdentity>>;

const LEGACY_REFERENCES: ReferenceByKind = {
  user: { provider: "environment", name: "SLACK_USER_TOKEN" },
  bot: { provider: "environment", name: "SLACK_BOT_TOKEN" },
};

export class CredentialResolver {
  readonly #providers: ReadonlyMap<string, CredentialProvider>;
  readonly #verifier: AuthVerifier;

  constructor(providers: readonly CredentialProvider[], verifier: AuthVerifier) {
    this.#providers = new Map(providers.map((provider) => [provider.providerId, provider]));
    this.#verifier = verifier;
  }

  async resolveForWorkspace(
    workspace: WorkspaceRecord,
    requirement: CredentialRequirement,
  ): Promise<VerifiedCredentialSet> {
    validateRequirement(requirement);
    const references: ReferenceByKind = {
      ...(workspace.credentialRefs?.user ? { user: workspace.credentialRefs.user } : {}),
      ...(workspace.credentialRefs?.bot ? { bot: workspace.credentialRefs.bot } : {}),
    };
    const secrets = await this.#resolveSecrets(references, false);
    return this.#verifySet(secrets, requirement, workspace.teamId);
  }

  async resolveLegacySingleWorkspace(
    requirement: CredentialRequirement,
  ): Promise<VerifiedCredentialSet> {
    validateRequirement(requirement);
    const secrets = await this.#resolveSecrets(LEGACY_REFERENCES, true);
    return this.#verifySet(secrets, requirement);
  }

  async #resolveSecrets(references: ReferenceByKind, allowMissing: boolean): Promise<SecretByKind> {
    const entries = (Object.entries(references) as [CredentialKind, CredentialReference][]).filter(
      ([, reference]) => reference !== undefined,
    );
    const groups = new Map<string, CredentialReference[]>();
    for (const [, reference] of entries) {
      const provider = this.#providers.get(reference.provider);
      if (!provider) {
        throw new CredentialError(
          "UNKNOWN_CREDENTIAL_PROVIDER",
          "Workspace references an unavailable credential provider",
        );
      }
      const group = groups.get(provider.providerId) ?? [];
      group.push(reference);
      groups.set(provider.providerId, group);
    }

    const values = new Map<string, ReadonlyMap<string, string | undefined>>();
    for (const [providerId, providerReferences] of groups) {
      const provider = this.#providers.get(providerId)!;
      try {
        const result = await provider.resolveMany(providerReferences);
        const get = (result as { get?: unknown } | null)?.get;
        if (typeof get !== "function") throw new TypeError("Invalid provider result");
        const snapshot = new Map<string, string | undefined>();
        for (const reference of providerReferences) {
          const value = Reflect.apply(get, result, [reference.name]) as unknown;
          if (value !== undefined && typeof value !== "string") {
            throw new TypeError("Invalid provider value");
          }
          snapshot.set(reference.name, value);
        }
        values.set(providerId, snapshot);
      } catch {
        throw new CredentialError(
          "CREDENTIAL_PROVIDER_FAILED",
          "Credential provider could not resolve the requested references",
        );
      }
    }

    const secrets: SecretByKind = {};
    try {
      for (const [kind, reference] of entries) {
        const value = values.get(reference.provider)?.get(reference.name);
        if (!value) {
          if (allowMissing) continue;
          throw new CredentialError(
            "CONFIGURED_CREDENTIAL_MISSING",
            "A configured workspace credential is unavailable",
          );
        }
        secrets[kind] = createCredentialSecret(value, kind);
      }
      return secrets;
    } catch (error) {
      destroySecrets(secrets);
      throw error;
    }
  }

  async #verifySet(
    secrets: SecretByKind,
    requirement: CredentialRequirement,
    expectedTeamId?: TeamId,
  ): Promise<VerifiedCredentialSet> {
    try {
      for (const required of requirement.requiredKinds) {
        if (!secrets[required]) {
          throw new CredentialError(
            "REQUIRED_CREDENTIAL_MISSING",
            `Required ${required} credential is unavailable`,
          );
        }
      }

      const identities: IdentityByKind = {};
      for (const kind of ["user", "bot"] as const) {
        const secret = secrets[kind];
        if (!secret) continue;
        let result: AuthIdentity;
        try {
          result = await this.#verifier.verify(secret);
        } catch {
          throw new CredentialError(
            "AUTH_VERIFICATION_FAILED",
            "Slack credential identity verification failed",
          );
        }
        try {
          identities[kind] = normalizeAuthIdentity(result);
        } catch {
          throw new CredentialError(
            "AUTH_IDENTITY_INVALID",
            "Slack credential returned an invalid identity",
          );
        }
      }

      const userIdentity = identities.user;
      const botIdentity = identities.bot;
      if (botIdentity && !botIdentity.botId) {
        throw new CredentialError(
          "BOT_IDENTITY_REQUIRED",
          "Bot credential did not resolve to a bot identity",
        );
      }
      if (userIdentity?.botId) {
        throw new CredentialError(
          "AUTH_IDENTITY_INVALID",
          "User credential resolved to a bot identity",
        );
      }
      if (userIdentity && botIdentity && userIdentity.teamId !== botIdentity.teamId) {
        throw new CredentialError(
          "CROSS_TEAM_CREDENTIALS",
          "User and Bot credentials belong to different workspaces",
        );
      }

      const actualTeamId = userIdentity?.teamId ?? botIdentity?.teamId;
      if (!actualTeamId) {
        throw new CredentialError(
          "REQUIRED_CREDENTIAL_MISSING",
          "No credential is available for the requested operation",
        );
      }
      if (expectedTeamId && actualTeamId !== expectedTeamId) {
        throw new CredentialError(
          "TEAM_ID_MISMATCH",
          "Credential does not belong to the selected workspace",
        );
      }

      return createVerifiedCredentialSet(
        actualTeamId,
        secrets.user && userIdentity
          ? createVerifiedCredential("user", userIdentity.teamId, secrets.user)
          : undefined,
        secrets.bot && botIdentity
          ? createVerifiedCredential("bot", botIdentity.teamId, secrets.bot)
          : undefined,
        copyScopes(requirement.requiredScopes),
      );
    } catch (error) {
      destroySecrets(secrets);
      throw error;
    }
  }
}

function validateRequirement(requirement: CredentialRequirement): void {
  const kinds = requirement.requiredKinds;
  if (
    kinds.length === 0 ||
    new Set(kinds).size !== kinds.length ||
    kinds.some((kind) => kind !== "user" && kind !== "bot")
  ) {
    throw new CredentialError(
      "INVALID_CREDENTIAL_REQUIREMENT",
      "Credential requirement must contain unique supported token kinds",
    );
  }
  const scopes = requirement.requiredScopes;
  if (!scopes) return;
  const scopeKinds = Object.keys(scopes);
  if (
    scopeKinds.some((kind) => kind !== "user" && kind !== "bot") ||
    scopeKinds.some((kind) => !kinds.includes(kind as CredentialKind)) ||
    scopeKinds.some((kind) => {
      const values = scopes[kind as CredentialKind];
      return (
        !Array.isArray(values) ||
        values.some((scope) => typeof scope !== "string" || scope.length === 0) ||
        new Set(values).size !== values.length
      );
    })
  ) {
    throw new CredentialError(
      "INVALID_CREDENTIAL_REQUIREMENT",
      "Credential scopes must belong to required token kinds and contain unique non-empty values",
    );
  }
}

function normalizeAuthIdentity(value: unknown): AuthIdentity {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Invalid auth identity");
  }
  const input = value as Record<string, unknown>;
  const teamId = parseTeamId(input.teamId);
  const userId = optionalIdentityId(input.userId);
  const botId = optionalIdentityId(input.botId);
  const enterpriseId = optionalIdentityId(input.enterpriseId);
  return Object.freeze({
    teamId,
    ...(userId ? { userId } : {}),
    ...(botId ? { botId } : {}),
    ...(enterpriseId ? { enterpriseId } : {}),
  });
}

function optionalIdentityId(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new TypeError("Invalid auth identity field");
  }
  return value;
}

function copyScopes(
  scopes: CredentialRequirement["requiredScopes"],
): Partial<Record<CredentialKind, readonly string[]>> {
  return Object.freeze({
    ...(scopes?.user ? { user: Object.freeze([...scopes.user]) } : {}),
    ...(scopes?.bot ? { bot: Object.freeze([...scopes.bot]) } : {}),
  });
}

function destroySecrets(secrets: SecretByKind): void {
  secrets.user?.destroy();
  secrets.bot?.destroy();
}
