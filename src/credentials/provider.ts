import type { CredentialReference } from "../domain/workspace.js";

export type { CredentialReference } from "../domain/workspace.js";

export interface CredentialProvider {
  readonly providerId: string;
  resolveMany(
    references: readonly CredentialReference[],
  ): Promise<ReadonlyMap<string, string | undefined>>;
}
