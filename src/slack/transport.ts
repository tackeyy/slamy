import type { TeamId } from "../domain/team-id.js";
import type { SlackApiMethod } from "./method-policy.js";

export type SlackTransportRequest = {
  readonly method: SlackApiMethod;
  readonly token: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly requestId: string;
  readonly teamId: TeamId;
};

export interface SlackTransport {
  call(request: SlackTransportRequest): Promise<unknown>;
}

export interface SlackAuthTestTransport {
  authTest(token: string): Promise<unknown>;
}
