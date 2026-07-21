import type { TeamId } from "../domain/team-id.js";
import type { CredentialSecret } from "./secret.js";
import type {
  CredentialKind,
  VerifiedCredential,
  VerifiedCredentialSet,
} from "./types.js";

class VerifiedCredentialValue implements VerifiedCredential {
  readonly kind: CredentialKind;
  readonly teamId: TeamId;
  readonly #secret: CredentialSecret;

  constructor(kind: CredentialKind, teamId: TeamId, secret: CredentialSecret) {
    this.kind = kind;
    this.teamId = teamId;
    this.#secret = secret;
  }

  use<Result>(consumer: (token: string) => Result): Result {
    return this.#secret.use(consumer);
  }

  destroy(): void {
    this.#secret.destroy();
  }

  toJSON(): { kind: CredentialKind; teamId: TeamId; token: "[REDACTED]" } {
    return { kind: this.kind, teamId: this.teamId, token: "[REDACTED]" };
  }
}

export function createVerifiedCredential(
  kind: CredentialKind,
  teamId: TeamId,
  secret: CredentialSecret,
): VerifiedCredential {
  return Object.freeze(new VerifiedCredentialValue(kind, teamId, secret));
}

class VerifiedCredentialSetValue implements VerifiedCredentialSet {
  readonly teamId: TeamId;
  readonly user?: VerifiedCredential;
  readonly bot?: VerifiedCredential;
  readonly requiredScopes: Partial<Record<CredentialKind, readonly string[]>>;

  constructor(
    teamId: TeamId,
    user: VerifiedCredential | undefined,
    bot: VerifiedCredential | undefined,
    requiredScopes: Partial<Record<CredentialKind, readonly string[]>>,
  ) {
    this.teamId = teamId;
    if (user) this.user = user;
    if (bot) this.bot = bot;
    this.requiredScopes = requiredScopes;
  }

  destroy(): void {
    this.user?.destroy();
    this.bot?.destroy();
  }

  toJSON(): Omit<VerifiedCredentialSet, "destroy"> {
    return {
      teamId: this.teamId,
      ...(this.user ? { user: this.user } : {}),
      ...(this.bot ? { bot: this.bot } : {}),
      requiredScopes: this.requiredScopes,
    };
  }
}

export function createVerifiedCredentialSet(
  teamId: TeamId,
  user: VerifiedCredential | undefined,
  bot: VerifiedCredential | undefined,
  requiredScopes: Partial<Record<CredentialKind, readonly string[]>>,
): VerifiedCredentialSet {
  return Object.freeze(new VerifiedCredentialSetValue(teamId, user, bot, requiredScopes));
}
