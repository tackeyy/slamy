import type { WebClient } from "@slack/web-api";
import type { CredentialKind } from "../credentials/types.js";
import type { TeamId } from "../domain/team-id.js";

export type LocalSessionConnection = {
  readonly version: 1;
  readonly teamId: TeamId;
  readonly credentialKind: CredentialKind;
  readonly socketPath: string;
  readonly capability: string;
  readonly createdAt: string;
  readonly expiresAt: string;
};

export type LocalSessionRequest = (
  connection: LocalSessionConnection,
  method: string,
  argumentsValue: Readonly<Record<string, unknown>>,
) => Promise<unknown>;

const ALLOWED_METHODS = new Set([
  "assistant.threads.setStatus",
  "auth.test",
  "bots.info",
  "chat.delete",
  "chat.postMessage",
  "chat.scheduleMessage",
  "chat.update",
  "conversations.history",
  "conversations.create",
  "conversations.info",
  "conversations.list",
  "conversations.members",
  "conversations.open",
  "conversations.replies",
  "conversations.setPurpose",
  "conversations.setTopic",
  "files.info",
  "files.download",
  "files.uploadV2",
  "reactions.add",
  "reactions.get",
  "reactions.list",
  "reactions.remove",
  "search.messages",
  "team.info",
  "users.conversations",
  "users.info",
  "users.list",
]);

export function isAllowedLocalSessionMethod(method: string): boolean {
  return ALLOWED_METHODS.has(method);
}

export function createLocalSessionWebClient(
  connection: LocalSessionConnection,
  request: LocalSessionRequest,
): WebClient {
  return createPathProxy([]) as WebClient;

  function createPathProxy(path: readonly string[]): unknown {
    return new Proxy(() => undefined, {
      get(_target, property) {
        if (property === "then") return undefined;
        if (typeof property !== "string") return undefined;
        return createPathProxy([...path, property]);
      },
      apply(_target, _thisArg, argumentsList) {
        const method = path.join(".");
        if (!isAllowedLocalSessionMethod(method)) {
          return Promise.reject(new Error("Slack API method is not allowed in a local session"));
        }
        const input = argumentsList[0] ?? {};
        if (input === null || typeof input !== "object" || Array.isArray(input)) {
          return Promise.reject(new TypeError("Slack API arguments must be an object"));
        }
        return request(
          connection,
          method,
          input as Readonly<Record<string, unknown>>,
        );
      },
    });
  }
}
