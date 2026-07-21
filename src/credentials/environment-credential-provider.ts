import { CredentialError } from "./errors.js";
import type { CredentialProvider, CredentialReference } from "./provider.js";

export class EnvironmentCredentialProvider implements CredentialProvider {
  readonly providerId = "environment";
  readonly #env: NodeJS.ProcessEnv;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.#env = env;
  }

  resolveMany(
    references: readonly CredentialReference[],
  ): Promise<ReadonlyMap<string, string | undefined>> {
    try {
      const snapshot = new Map<string, string | undefined>();
      for (const reference of references) {
        if (reference.provider !== this.providerId || snapshot.has(reference.name)) continue;
        const value = this.#env[reference.name];
        snapshot.set(reference.name, value && value.length > 0 ? value : undefined);
      }
      return Promise.resolve(snapshot);
    } catch {
      return Promise.reject(
        new CredentialError(
          "CREDENTIAL_PROVIDER_FAILED",
          "Credential provider could not resolve the requested references",
        ),
      );
    }
  }
}
