---
"slamy": minor
---

Add `team info` command and `getTeamInfo()` client method (wraps the `team.info` API).

Returns the workspace `domain`, `email_domain`, and Enterprise Grid info. The `email_domain` is useful for diagnosing SSO domain mismatches (e.g. external members on a different email domain failing SSO). Requires the `team:read` user-token scope.

Note: SSO enforcement settings (required/optional, member/guest exclusions) are **not** exposed by the Slack Web API and cannot be read or changed via this command.
