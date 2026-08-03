---
"slamy": minor
---

Add an optional `logger` to `SlamyClientOptions` so internal warnings reach the caller's logging stack.

slamy is imported as a library as well as run as a CLI, so writing to `console` directly bypasses the caller's structured logging. `SlamyLogger` matches the pino/bunyan `(obj, msg)` signature, so those logger instances can be passed straight through; omitting it keeps the client silent. The `reactions.list` truncation warning now goes through the logger instead of `console.warn`, and the bot-token read fallback reports whether it succeeded or failed along with both error codes.
