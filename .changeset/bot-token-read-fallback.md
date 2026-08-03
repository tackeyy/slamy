---
"slamy": patch
---

Fall back to the bot token when a user-token read fails with `channel_not_found` / `not_in_channel`.

`getThreadReplies()` and `getChannelHistory()` previously used the user token only, so a private channel that the bot had joined but the user-token owner had not could not be read at all. The user token still takes priority; the bot token is retried once, and only for those two error codes. The retry is skipped when both tokens resolve to the same client (no `botToken` given, or a local session), and when the bot token also fails the thrown error keeps the user-token failure reason.
