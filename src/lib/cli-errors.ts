// CLI のエラー処理ヘルパー。
// src/cli/index.ts から import して使うことで、テストが実コードと結びつく。

export type ExitCode = 0 | 1 | 2;

export type ExitFn = (code: ExitCode) => void;
export type LogFn = (msg: string) => void;

export const handleCliError = (
  err: unknown,
  exit: ExitFn,
  log: LogFn,
): void => {
  const message = err instanceof Error ? err.message : String(err);
  log(`Error: ${message}`);
  exit(1);
};

export interface TokenPair {
  userToken?: string;
  botToken?: string;
}

export const requireToken = (
  env: NodeJS.ProcessEnv,
  exit: ExitFn,
  log: LogFn,
): TokenPair | undefined => {
  const userToken = env["SLACK_USER_TOKEN"];
  const botToken = env["SLACK_BOT_TOKEN"];
  if (!userToken && !botToken) {
    log("Error: SLACK_USER_TOKEN or SLACK_BOT_TOKEN is not set");
    exit(1);
    return undefined;
  }
  return { userToken, botToken };
};
