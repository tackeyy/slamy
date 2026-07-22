import { LogLevel, WebClient } from "@slack/web-api";
import type {
  SlackAuthTestTransport,
  SlackTransport,
  SlackTransportRequest,
} from "./transport.js";

export type NodeSlackWebApiClientOptions = {
  readonly rejectRateLimitedCalls: true;
  readonly retries: 0;
  readonly logLevel: "error";
};

type SlackWebApiClient = {
  apiCall(method: string, options: Record<string, unknown>): Promise<unknown>;
};

type SlackWebApiClientFactory = (
  token: string,
  options: NodeSlackWebApiClientOptions,
) => SlackWebApiClient;

const CLIENT_OPTIONS: NodeSlackWebApiClientOptions = Object.freeze({
  rejectRateLimitedCalls: true,
  retries: 0,
  logLevel: "error",
});

export class NodeSlackWebApiTransport implements SlackTransport, SlackAuthTestTransport {
  readonly #createClient: SlackWebApiClientFactory;

  constructor(createClient: SlackWebApiClientFactory = createProductionClient) {
    this.#createClient = createClient;
  }

  call(request: SlackTransportRequest): Promise<unknown> {
    const client = this.#createClient(request.token, CLIENT_OPTIONS);
    return client.apiCall(request.method, { ...request.arguments });
  }

  authTest(token: string): Promise<unknown> {
    const client = this.#createClient(token, CLIENT_OPTIONS);
    return client.apiCall("auth.test", {});
  }
}

function createProductionClient(token: string): SlackWebApiClient {
  return new WebClient(token, {
    rejectRateLimitedCalls: true,
    retryConfig: { retries: 0 },
    logLevel: LogLevel.ERROR,
    logger: {
      debug() {},
      info() {},
      warn() {},
      error() {},
      setLevel() {},
      getLevel: () => LogLevel.ERROR,
      setName() {},
    },
  });
}
