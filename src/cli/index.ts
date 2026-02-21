#!/usr/bin/env node
import { Command } from "commander";
import { SlamyClient } from "../lib/client.js";

const program = new Command();

program
  .name("slamy")
  .description("Slack CLI tool")
  .version("2.0.0")
  .option("--json", "Output in JSON format")
  .option("--plain", "Output in TSV format");

function getOutputMode(): "json" | "plain" | "human" {
  const opts = program.opts();
  if (opts.json) return "json";
  if (opts.plain) return "plain";
  return "human";
}

function createClient(): SlamyClient {
  const userToken = process.env.SLACK_USER_TOKEN;
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!userToken && !botToken) {
    console.error("Error: SLACK_USER_TOKEN or SLACK_BOT_TOKEN is not set");
    process.exit(1);
  }
  return new SlamyClient({ userToken, botToken });
}

function jsonOutput(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function formatTimestamp(ts: string): string {
  const sec = parseInt(ts, 10);
  if (isNaN(sec) || sec === 0) return ts;
  const d = new Date(sec * 1000);
  return d.toISOString().replace("T", " ").slice(0, 16);
}

// --- auth ---
const auth = program.command("auth").description("Authentication commands");

auth
  .command("test")
  .description("Test authentication with Slack API")
  .action(async () => {
    try {
      const client = createClient();
      const info = await client.authTest();
      const mode = getOutputMode();

      if (mode === "json") {
        jsonOutput(info);
      } else if (mode === "plain") {
        console.log(`${info.user_id}\t${info.user}\t${info.team_id}\t${info.team}`);
      } else {
        console.log(`Authenticated as: ${info.user} (${info.user_id})`);
        console.log(`Team: ${info.team} (${info.team_id})`);
        console.log(`URL: ${info.url}`);
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// --- channels ---
const channels = program.command("channels").description("Channel operations");

channels
  .command("list")
  .description("List channels")
  .option("--limit <n>", "Maximum number of channels", "100")
  .option("--include-archived", "Include archived channels")
  .option("--unread", "Only show channels with unread messages")
  .action(async (opts) => {
    try {
      const client = createClient();
      const mode = getOutputMode();
      const limit = parseInt(opts.limit, 10);

      if (opts.unread) {
        const unreadChannels = await client.listUnreadChannels({ limit });

        if (mode === "json") {
          jsonOutput(unreadChannels);
        } else if (mode === "plain") {
          for (const ch of unreadChannels) {
            console.log(
              `${ch.id}\t${ch.name}\t${ch.num_members}\t${ch.is_private ? "private" : ""}\t${ch.unread_count}`,
            );
          }
        } else {
          if (unreadChannels.length === 0) {
            console.log("No unread channels");
          } else {
            for (const ch of unreadChannels) {
              const priv = ch.is_private ? " (private)" : "";
              console.log(
                `#${ch.name.padEnd(30)} ${ch.id}${priv}  [${ch.unread_count} unread]`,
              );
            }
          }
        }
      } else {
        const allChannels = await client.listChannels({
          limit,
          includeArchived: opts.includeArchived,
        });

        if (mode === "json") {
          jsonOutput(allChannels);
        } else if (mode === "plain") {
          for (const ch of allChannels) {
            console.log(
              `${ch.id}\t${ch.name}\t${ch.num_members}\t${ch.is_private ? "private" : ""}\t${ch.topic}`,
            );
          }
        } else {
          for (const ch of allChannels) {
            const priv = ch.is_private ? " (private)" : "";
            console.log(
              `#${ch.name.padEnd(30)} ${ch.id}${priv}  [${ch.num_members} members]`,
            );
          }
        }
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

channels
  .command("history <channel_id>")
  .description("Get channel message history")
  .option("--limit <n>", "Maximum number of messages", "20")
  .action(async (channelId, opts) => {
    try {
      const client = createClient();
      const mode = getOutputMode();
      const messages = await client.getChannelHistory(channelId, {
        limit: parseInt(opts.limit, 10),
      });

      if (mode === "json") {
        jsonOutput(messages);
      } else if (mode === "plain") {
        for (const msg of messages) {
          const text = msg.text.replace(/\n/g, "\\n");
          console.log(`${msg.ts}\t${msg.user}\t${text}`);
        }
      } else {
        for (const msg of messages) {
          const ts = formatTimestamp(msg.ts);
          const thread = msg.reply_count ? ` [${msg.reply_count} replies]` : "";
          console.log(`[${ts}] ${msg.user}: ${msg.text}${thread}`);
        }
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// --- messages ---
const messages = program.command("messages").description("Message operations");

messages
  .command("post <channel_id>")
  .description("Post a message to a channel")
  .requiredOption("--text <text>", "Message text")
  .action(async (channelId, opts) => {
    try {
      const client = createClient();
      const mode = getOutputMode();
      const result = await client.postMessage(channelId, opts.text);

      if (mode === "json") {
        jsonOutput(result);
      } else if (mode === "plain") {
        console.log(`${result.channel}\t${result.ts}`);
      } else {
        console.log(`Message posted to ${result.channel} (ts: ${result.ts})`);
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

messages
  .command("reply <channel_id> <thread_ts>")
  .description("Reply to a thread")
  .requiredOption("--text <text>", "Reply text")
  .action(async (channelId, threadTs, opts) => {
    try {
      const client = createClient();
      const mode = getOutputMode();
      const result = await client.replyToThread(channelId, threadTs, opts.text);

      if (mode === "json") {
        jsonOutput({ channel: result.channel, ts: result.ts, thread_ts: threadTs });
      } else if (mode === "plain") {
        console.log(`${result.channel}\t${result.ts}\t${threadTs}`);
      } else {
        console.log(
          `Reply posted to ${result.channel} thread ${threadTs} (ts: ${result.ts})`,
        );
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

messages
  .command("update <channel_id> <ts>")
  .description("Update a message")
  .requiredOption("--text <text>", "New message text")
  .action(async (channelId, ts, opts) => {
    try {
      const client = createClient();
      const mode = getOutputMode();
      const result = await client.updateMessage(channelId, ts, opts.text);

      if (mode === "json") {
        jsonOutput(result);
      } else if (mode === "plain") {
        console.log(`${result.channel}\t${result.ts}`);
      } else {
        console.log(`Message updated in ${result.channel} (ts: ${result.ts})`);
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

messages
  .command("delete <channel_id> <ts>")
  .description("Delete a message")
  .action(async (channelId, ts) => {
    try {
      const client = createClient();
      const mode = getOutputMode();
      await client.deleteMessage(channelId, ts);

      if (mode === "json") {
        jsonOutput({ channel: channelId, ts, deleted: true });
      } else if (mode === "plain") {
        console.log(`${channelId}\t${ts}\tdeleted`);
      } else {
        console.log(`Message deleted from ${channelId} (ts: ${ts})`);
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// --- users ---
const users = program.command("users").description("User operations");

users
  .command("list")
  .description("List workspace users")
  .option("--include-deactivated", "Include deactivated users")
  .option("--include-bots", "Include bot users")
  .action(async (opts) => {
    try {
      const client = createClient();
      const mode = getOutputMode();
      const userList = await client.listUsers({
        includeDeactivated: opts.includeDeactivated,
        includeBots: opts.includeBots,
      });

      if (mode === "json") {
        jsonOutput(userList);
      } else if (mode === "plain") {
        for (const u of userList) {
          console.log(
            `${u.id}\t${u.name}\t${u.real_name}\t${u.display_name}\t${u.email || ""}`,
          );
        }
      } else {
        for (const u of userList) {
          const display = u.display_name || u.real_name;
          console.log(`${u.id.padEnd(12)} @${u.name.padEnd(20)} ${display}`);
        }
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

users
  .command("profile <user_id>")
  .description("Get user profile")
  .action(async (userId) => {
    try {
      const client = createClient();
      const mode = getOutputMode();
      const profile = await client.getUserProfile(userId);

      if (mode === "json") {
        jsonOutput(profile);
      } else if (mode === "plain") {
        console.log(
          `${profile.id}\t${profile.name}\t${profile.real_name}\t${profile.display_name}\t${profile.email}\t${profile.title}`,
        );
      } else {
        const display = profile.display_name || profile.real_name;
        console.log(`User: ${display} (@${profile.name})`);
        console.log(`ID: ${profile.id}`);
        if (profile.title) console.log(`Title: ${profile.title}`);
        if (profile.email) console.log(`Email: ${profile.email}`);
        if (profile.status_text)
          console.log(`Status: ${profile.status_emoji} ${profile.status_text}`);
        console.log(`Timezone: ${profile.tz}`);
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// --- reactions ---
const reactions = program.command("reactions").description("Reaction operations");

reactions
  .command("add <channel_id> <timestamp>")
  .description("Add a reaction to a message")
  .requiredOption("--name <emoji>", "Reaction emoji name (without colons)")
  .action(async (channelId, timestamp, opts) => {
    try {
      const client = createClient();
      const mode = getOutputMode();
      await client.addReaction(channelId, timestamp, opts.name);

      if (mode === "json") {
        jsonOutput({ channel: channelId, ts: timestamp, reaction: opts.name });
      } else if (mode === "plain") {
        console.log(`${channelId}\t${timestamp}\t${opts.name}`);
      } else {
        console.log(
          `Reaction :${opts.name}: added to ${channelId} at ${timestamp}`,
        );
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

reactions
  .command("remove <channel_id> <timestamp>")
  .description("Remove a reaction from a message")
  .requiredOption("--name <emoji>", "Reaction emoji name (without colons)")
  .action(async (channelId, timestamp, opts) => {
    try {
      const client = createClient();
      const mode = getOutputMode();
      await client.removeReaction(channelId, timestamp, opts.name);

      if (mode === "json") {
        jsonOutput({ channel: channelId, ts: timestamp, reaction: opts.name, removed: true });
      } else if (mode === "plain") {
        console.log(`${channelId}\t${timestamp}\t${opts.name}\tremoved`);
      } else {
        console.log(
          `Reaction :${opts.name}: removed from ${channelId} at ${timestamp}`,
        );
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// --- search ---
const search = program.command("search").description("Search operations");

search
  .command("messages <query>")
  .description("Search messages (requires User Token)")
  .option("--count <n>", "Number of results per page", "20")
  .option("--page <n>", "Page number", "1")
  .option("--sort <field>", "Sort by (timestamp or score)", "timestamp")
  .option("--sort-dir <dir>", "Sort direction (asc or desc)", "desc")
  .action(async (query, opts) => {
    try {
      const client = createClient();
      const mode = getOutputMode();
      const result = await client.searchMessages(query, {
        count: parseInt(opts.count, 10),
        page: parseInt(opts.page, 10),
        sort: opts.sort,
        sortDir: opts.sortDir,
      });

      if (mode === "json") {
        jsonOutput(result);
      } else if (mode === "plain") {
        for (const m of result.matches) {
          const text = m.text.replace(/\n/g, "\\n");
          console.log(
            `${m.ts}\t${m.channel_id}\t${m.channel}\t${m.user}\t${text}\t${m.permalink}`,
          );
        }
      } else {
        console.log(`Found ${result.total} results (page ${result.page})\n`);
        for (const m of result.matches) {
          const ts = formatTimestamp(m.ts);
          let text = m.text;
          if (text.length > 200) text = text.slice(0, 200) + "...";
          console.log(`[${ts}] #${m.channel} ${m.user}:`);
          console.log(`  ${text}`);
          console.log(`  ${m.permalink}\n`);
        }
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// --- threads ---
const threads = program.command("threads").description("Thread operations");

threads
  .command("replies <channel_id> <thread_ts>")
  .description("Get thread replies")
  .option("--limit <n>", "Maximum number of replies", "50")
  .action(async (channelId, threadTs, opts) => {
    try {
      const client = createClient();
      const mode = getOutputMode();
      const msgs = await client.getThreadReplies(channelId, threadTs, {
        limit: parseInt(opts.limit, 10),
      });

      if (mode === "json") {
        jsonOutput(msgs);
      } else if (mode === "plain") {
        for (const msg of msgs) {
          const text = msg.text.replace(/\n/g, "\\n");
          console.log(`${msg.ts}\t${msg.user}\t${text}`);
        }
      } else {
        for (const msg of msgs) {
          const ts = formatTimestamp(msg.ts);
          console.log(`[${ts}] ${msg.user}: ${msg.text}`);
        }
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// --- files ---
const files = program.command("files").description("File operations");

files
  .command("upload <channel_id> <file_path>")
  .description("Upload a file to a channel")
  .option("--thread-ts <ts>", "Thread timestamp")
  .option("--title <title>", "File title")
  .option("--filename <name>", "File name")
  .action(async (channelId, filePath, opts) => {
    try {
      const client = createClient();
      const mode = getOutputMode();
      await client.uploadFile(channelId, filePath, {
        threadTs: opts.threadTs,
        title: opts.title,
        filename: opts.filename,
      });

      if (mode === "json") {
        jsonOutput({ channel: channelId, file: filePath, uploaded: true });
      } else if (mode === "plain") {
        console.log(`${channelId}\t${filePath}\tuploaded`);
      } else {
        console.log(`File uploaded to ${channelId}: ${filePath}`);
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
