import { describe, expect, it, vi } from "vitest";
import type { AuthIdentity, AuthVerifier } from "../../credentials/auth-verifier.js";
import { CredentialResolver } from "../../credentials/resolver.js";
import { EnvironmentCredentialProvider } from "../../credentials/environment-credential-provider.js";
import type { CredentialHandle } from "../../credentials/auth-verifier.js";
import { parseTeamId } from "../../domain/team-id.js";
import { WorkspaceRegistry } from "../../workspace/registry.js";
import type { WorkspaceStore } from "../../workspace/store.js";
import type { WorkspaceRegistryDocument } from "../../workspace/types.js";
import {
  collectCliWorkspaceSelector,
  createCliApiClient,
  resolveCliWorkspaceSelector,
} from "../api-client.js";

const WEDGE_TEAM = parseTeamId("TWEDGE001");
const MANAVI_TEAM = parseTeamId("TMANAVI01");

class MemoryStore implements WorkspaceStore {
  constructor(readonly document: WorkspaceRegistryDocument) {}

  read(): Promise<WorkspaceRegistryDocument> {
    return Promise.resolve(structuredClone(this.document));
  }

  write(): Promise<void> {
    throw new Error("not used");
  }

  update(): Promise<WorkspaceRegistryDocument> {
    throw new Error("not used");
  }
}

class TokenIdentityVerifier implements AuthVerifier {
  constructor(private readonly identities: Readonly<Record<string, AuthIdentity>>) {}

  verify(secret: CredentialHandle): Promise<AuthIdentity> {
    return Promise.resolve(
      secret.use((token) => {
        const identity = this.identities[token];
        if (!identity) throw new Error("unknown test credential");
        return identity;
      }),
    );
  }
}

function registry(): WorkspaceRegistry {
  return new WorkspaceRegistry(
    new MemoryStore({
      version: 1,
      defaultTeamId: MANAVI_TEAM,
      workspaces: [
        {
          teamId: WEDGE_TEAM,
          alias: "wedgeai",
          domain: "wedgeai.slack.com",
          previousDomains: ["wedge-ai.slack.com"],
          displayName: "WedgeAI",
          credentialRefs: {
            user: { provider: "environment", name: "WEDGE_USER_TOKEN" },
          },
        },
        {
          teamId: MANAVI_TEAM,
          alias: "manavi",
          domain: "ma-navi.slack.com",
          previousDomains: [],
          displayName: "M&A Navi",
          credentialRefs: {
            user: { provider: "environment", name: "MANAVI_USER_TOKEN" },
          },
        },
      ],
    }),
  );
}

function resolver(
  env: NodeJS.ProcessEnv,
  identities: Readonly<Record<string, AuthIdentity>>,
): CredentialResolver {
  return new CredentialResolver(
    [new EnvironmentCredentialProvider(env)],
    new TokenIdentityVerifier(identities),
  );
}

describe("CLI workspace API client", () => {
  it.each(["wedgeai", WEDGE_TEAM, "wedgeai.slack.com", "wedge-ai.slack.com"])(
    "root selector %s resolves WedgeAI and never uses M&A Navi or legacy credentials",
    async (selector) => {
      const env = {
        SLAMY_DEFAULT_WORKSPACE: "manavi",
        WEDGE_USER_TOKEN: "xoxp-wedge-test",
        MANAVI_USER_TOKEN: "xoxp-manavi-test",
        SLACK_USER_TOKEN: "xoxp-legacy-manavi-test",
      };
      const clientFactory = vi.fn().mockReturnValue({ workspace: "wedgeai" });

      const lease = await createCliApiClient({
        explicitWorkspace: selector,
        env,
        registry: registry(),
        credentialResolver: resolver(env, {
          "xoxp-wedge-test": { teamId: WEDGE_TEAM, userId: "UWEDGE" },
          "xoxp-manavi-test": { teamId: MANAVI_TEAM, userId: "UMANAVI" },
        }),
        clientFactory,
      });

      expect(lease.teamId).toBe(WEDGE_TEAM);
      expect(clientFactory).toHaveBeenCalledWith({ userToken: "xoxp-wedge-test" });
      expect(JSON.stringify(clientFactory.mock.calls)).not.toContain("manavi-test");
      expect(JSON.stringify(clientFactory.mock.calls)).not.toContain("legacy");
      lease.dispose();
    },
  );

  it("SLAMY_DEFAULT_WORKSPACE uses the same Team ID/domain/alias registry resolver", async () => {
    const env = {
      SLAMY_DEFAULT_WORKSPACE: "wedge-ai.slack.com",
      WEDGE_USER_TOKEN: "xoxp-wedge-test",
    };
    const clientFactory = vi.fn().mockReturnValue({});

    const lease = await createCliApiClient({
      env,
      registry: registry(),
      credentialResolver: resolver(env, {
        "xoxp-wedge-test": { teamId: WEDGE_TEAM, userId: "UWEDGE" },
      }),
      clientFactory,
    });

    expect(lease.teamId).toBe(WEDGE_TEAM);
    expect(clientFactory).toHaveBeenCalledWith({ userToken: "xoxp-wedge-test" });
    lease.dispose();
  });

  it("selected workspace missing credential fails without legacy fallback", async () => {
    const env = {
      SLAMY_DEFAULT_WORKSPACE: "wedgeai",
      MANAVI_USER_TOKEN: "xoxp-manavi-test",
      SLACK_USER_TOKEN: "xoxp-legacy-manavi-test",
    };
    const clientFactory = vi.fn();

    await expect(
      createCliApiClient({
        env,
        registry: registry(),
        credentialResolver: resolver(env, {}),
        clientFactory,
      }),
    ).rejects.toMatchObject({ code: "CONFIGURED_CREDENTIAL_MISSING" });
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("selected WedgeAI auth.test identity mismatch fails before an API client is created", async () => {
    const env = {
      WEDGE_USER_TOKEN: "xoxp-wedge-label-but-manavi-identity",
      SLACK_USER_TOKEN: "xoxp-legacy-manavi-test",
    };
    const clientFactory = vi.fn();

    await expect(
      createCliApiClient({
        explicitWorkspace: "wedgeai",
        env,
        registry: registry(),
        credentialResolver: resolver(env, {
          "xoxp-wedge-label-but-manavi-identity": {
            teamId: MANAVI_TEAM,
            userId: "UMANAVI",
          },
        }),
        clientFactory,
      }),
    ).rejects.toMatchObject({ code: "TEAM_ID_MISMATCH" });
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("legacy single-workspace mode remains available only without a selector", async () => {
    const clientFactory = vi.fn().mockReturnValue({});
    const lease = await createCliApiClient({
      env: { SLACK_USER_TOKEN: "xoxp-legacy-test" },
      registry: registry(),
      credentialResolver: resolver({}, {}),
      clientFactory,
    });

    expect(lease.teamId).toBeUndefined();
    expect(clientFactory).toHaveBeenCalledWith({ userToken: "xoxp-legacy-test" });
    lease.dispose();
  });
});

describe("resolveCliWorkspaceSelector", () => {
  it("explicit root selector wins over SLAMY_DEFAULT_WORKSPACE", () => {
    expect(
      resolveCliWorkspaceSelector("wedgeai", {
        SLAMY_DEFAULT_WORKSPACE: "manavi",
      }),
    ).toBe("wedgeai");
  });
});

describe("collectCliWorkspaceSelector", () => {
  it("fails closed when one invocation supplies conflicting root selectors", () => {
    expect(() => collectCliWorkspaceSelector("manavi", "wedgeai")).toThrow(
      "Conflicting --workspace selectors",
    );
  });
});
