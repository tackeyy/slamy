const SLACK_TOKEN_PREFIX = /^(?:x[a-z]{3}-|xox[a-z]\.xox[a-z]-)/i;
const SLACK_WEBHOOK_PREFIX = /^https:\/\/hooks\.slack(?:-gov)?\.com\/services\//i;

export function looksLikeSlackSecret(value: string): boolean {
  return SLACK_TOKEN_PREFIX.test(value) || SLACK_WEBHOOK_PREFIX.test(value);
}
