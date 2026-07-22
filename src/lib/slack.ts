import {
  WorkspaceSlackAdapter,
  type SlackDiagnosticSink,
  type SlackRequestIdFactory,
  type SlackVerificationHook,
  type WorkspaceSlackOperations,
} from "../slack/index.js";
import { NodeSlackWebApiTransport } from "../slack/web-api-transport.js";

export type CreateWorkspaceSlackAdapterOptions = {
  requestIdFactory?: SlackRequestIdFactory;
  diagnosticSink?: SlackDiagnosticSink;
  verificationHook?: SlackVerificationHook;
};

export function createWorkspaceSlackAdapter(
  options: CreateWorkspaceSlackAdapterOptions = {},
): WorkspaceSlackOperations {
  return new WorkspaceSlackAdapter({
    transport: new NodeSlackWebApiTransport(),
    ...options,
  });
}
