import {
  CredentialResolver,
  SlamyClient,
  createCredentialResolver,
  createWorkspaceRegistry,
  type CredentialKind,
  type SlamyClientOptions,
  type TeamId,
  type VerifiedCredentialSet,
  type WorkspaceRecord,
  type WorkspaceRegistry,
} from "../lib/index.js";

export type CliApiClientLease<Client = SlamyClient> = {
  readonly client: Client;
  readonly teamId?: TeamId;
  dispose(): void;
};

export type CreateCliApiClientOptions<Client = SlamyClient> = {
  explicitWorkspace?: string;
  env?: NodeJS.ProcessEnv;
  registry?: WorkspaceRegistry;
  credentialResolver?: CredentialResolver;
  clientFactory?: (tokens: SlamyClientOptions) => Client;
};

export function resolveCliWorkspaceSelector(
  explicitWorkspace: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return explicitWorkspace ?? env.SLAMY_DEFAULT_WORKSPACE;
}

export async function createCliApiClient<Client = SlamyClient>(
  options: CreateCliApiClientOptions<Client> = {},
): Promise<CliApiClientLease<Client>> {
  const env = options.env ?? process.env;
  const selector = resolveCliWorkspaceSelector(options.explicitWorkspace, env);
  const clientFactory =
    options.clientFactory ??
    ((tokens: SlamyClientOptions) => new SlamyClient(tokens) as Client);

  if (selector === undefined) {
    const tokens = legacyTokens(env);
    return {
      client: clientFactory(tokens),
      dispose() {},
    };
  }

  const registry = options.registry ?? createWorkspaceRegistry({ env });
  const workspace = await registry.resolve(selector);
  const resolver = options.credentialResolver ?? createCredentialResolver({ env });
  const credentials = await resolver.resolveForWorkspace(
    workspace,
    requirementFor(workspace),
  );

  try {
    return {
      client: clientFactory(clientOptions(credentials)),
      teamId: credentials.teamId,
      dispose: once(() => credentials.destroy()),
    };
  } catch (error) {
    credentials.destroy();
    throw error;
  }
}

function requirementFor(workspace: WorkspaceRecord): {
  requiredKinds: readonly CredentialKind[];
  operation: string;
} {
  const requiredKind: CredentialKind = workspace.credentialRefs?.user
    ? "user"
    : workspace.credentialRefs?.bot
      ? "bot"
      : "user";
  return {
    requiredKinds: [requiredKind],
    operation: "cli",
  };
}

function clientOptions(credentials: VerifiedCredentialSet): SlamyClientOptions {
  return {
    ...(credentials.user
      ? { userToken: credentials.user.use((token) => token) }
      : {}),
    ...(credentials.bot
      ? { botToken: credentials.bot.use((token) => token) }
      : {}),
  };
}

function legacyTokens(env: NodeJS.ProcessEnv): SlamyClientOptions {
  const userToken = env.SLACK_USER_TOKEN;
  const botToken = env.SLACK_BOT_TOKEN;
  if (!userToken && !botToken) {
    throw new Error("SLACK_USER_TOKEN or SLACK_BOT_TOKEN is not set");
  }
  return {
    ...(userToken ? { userToken } : {}),
    ...(botToken ? { botToken } : {}),
  };
}

function once(dispose: () => void): () => void {
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    dispose();
  };
}
