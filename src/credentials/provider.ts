export type CredentialReference = {
  provider: string;
  name: string;
};

export interface CredentialProvider {
  readonly providerId: string;
  resolveMany(
    references: readonly CredentialReference[],
  ): Promise<ReadonlyMap<string, string | undefined>>;
}
