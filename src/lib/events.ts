import { EventEmitter } from "node:events";
import { App } from "@slack/bolt";
import type { SlackEvent, ReactionAddedEvent } from "./types.js";

export interface SlamyEventsOptions {
  botToken: string;
  appToken: string;
}

export class SlamyEvents extends EventEmitter {
  private app: App;

  constructor(opts: SlamyEventsOptions) {
    super();
    this.app = new App({
      token: opts.botToken,
      appToken: opts.appToken,
      socketMode: true,
    });

    this.app.event("app_mention", async ({ event }) => {
      this.emit("app_mention", event as unknown as SlackEvent);
    });

    this.app.event("message", async ({ event }) => {
      this.emit("message", event as unknown as SlackEvent);
    });

    this.app.event("reaction_added", async ({ event }) => {
      this.emit("reaction_added", event as unknown as ReactionAddedEvent);
    });
  }

  async start(): Promise<void> {
    await this.app.start();
  }

  async stop(): Promise<void> {
    await this.app.stop();
  }
}
