# slamy

## 2.2.0

### Minor Changes

- 23227b4: Add `team info` command and `getTeamInfo()` client method (wraps the `team.info` API).

  Returns the workspace `domain`, `email_domain`, and Enterprise Grid info. The `email_domain` is useful for diagnosing SSO domain mismatches (e.g. external members on a different email domain failing SSO). Requires the `team:read` user-token scope.

  Note: SSO enforcement settings (required/optional, member/guest exclusions) are **not** exposed by the Slack Web API and cannot be read or changed via this command.

- 0a1313b: Add owner-only, in-memory local Slack sessions with 24-hour default and seven-day maximum TTLs.
- 901b7e6: Add an explicit-workspace `channels create` command with public/private creation, duplicate
  reconciliation, topic and purpose configuration, credential-free dry runs, and read-back verification.
- a44cb36: Add an optional `logger` to `SlamyClientOptions` so internal warnings reach the caller's logging stack.

  slamy is imported as a library as well as run as a CLI, so writing to `console` directly bypasses the caller's structured logging. `SlamyLogger` matches the pino/bunyan `(obj, msg)` signature, so those logger instances can be passed straight through; omitting it keeps the client silent. The `reactions.list` truncation warning now goes through the logger instead of `console.warn`, and the bot-token read fallback reports whether it succeeded or failed along with both error codes.

- d635963: Add a Team-ID-keyed TypeScript workspace registry with strict schema validation, private atomic
  file persistence, additive library exports, and offline `workspace list/add/remove/show/default`
  CLI commands. Document the v2 legacy-environment migration boundary and v3 removal horizon.
- 5e8baca: Add a secret-safe workspace credential resolver with User/Bot kind checks and Slack Team ID verification.
- 97c22a1: Add a strict workspace-aware Slack Target parser and resolver for archives permalinks,
  app client URLs, Team ID and hostname evidence, domain history, and legacy channel inputs.
- d94821d: Add secret-safe, explicit-workspace Slack operations with fixed User/Bot policies, bounded cursor
  pagination, normalized rate-limit metadata, and an internal Node Slack SDK transport.

### Patch Changes

- 23ef889: Fall back to the bot token when a user-token read fails with `channel_not_found` / `not_in_channel`.

  `getThreadReplies()` and `getChannelHistory()` previously used the user token only, so a private channel that the bot had joined but the user-token owner had not could not be read at all. The user token still takes priority; the bot token is retried once, and only for those two error codes. The retry is skipped when both tokens resolve to the same client (no `botToken` given, or a local session), and when the bot token also fails the thrown error keeps the user-token failure reason.

- 3f8e03a: Add a supervisor-friendly foreground mode for local Slack sessions.
- 9110109: fix: local session broker no longer crashes with ERR_STREAM_WRITE_AFTER_END when a client disconnects or half-closes before the response is written
- 25436cd: Repository hygiene: align docs and config with the OSS Node.js template.

  - Migrate `tsconfig.json` to `module: NodeNext`, `target: ES2023`, and
    `verbatimModuleSyntax: true` for consistent ESM builds. **Downstream consumers
    importing `slamy` from TypeScript:** relative imports inside this package now
    require `.js` extensions in source. Public API surface is unchanged.
  - Extract CLI helpers (`jsonOutput`, `requireToken`) into `src/lib/cli-format.ts`
    and `src/lib/cli-errors.ts` so unit tests can exercise the same code the CLI
    runs.
  - Add SECURITY.md, dependabot config, markdown/yaml lint, vitest coverage
    thresholds, ci.yml, and a changesets-based npm release workflow.
