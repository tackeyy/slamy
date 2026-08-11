import type { AuthVerifier } from "../credentials/auth-verifier.js";
import { EnvironmentCredentialProvider } from "../credentials/environment-credential-provider.js";
import type { CredentialProvider } from "../credentials/provider.js";
import { CredentialResolver } from "../credentials/resolver.js";
import { SlackAuthTestVerifier } from "../slack/auth-test-verifier.js";

export type CreateCredentialResolverOptions = {
  env?: NodeJS.ProcessEnv;
  providers?: readonly CredentialProvider[];
  verifier?: AuthVerifier;
};

export function createCredentialResolver(
  options: CreateCredentialResolverOptions = {},
): CredentialResolver {
  const providers = options.providers ?? [new EnvironmentCredentialProvider(options.env)];
  const verifier = options.verifier ?? new SlackAuthTestVerifier();
  return new CredentialResolver(providers, verifier);
}
