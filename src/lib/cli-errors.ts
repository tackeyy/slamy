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

export interface BuildAuthGuidanceOptions {
  /** workspace registry に登録されている alias の一覧（空配列 = 未登録） */
  workspaceAliases: string[];
  /** SLACK_USER_TOKEN が設定されているか（値は渡さない） */
  hasLegacyUserToken?: boolean;
  /** SLACK_BOT_TOKEN が設定されているか（値は渡さない） */
  hasLegacyBotToken?: boolean;
}

/**
 * 未認証エラー時に表示する self-documenting なガイダンスメッセージを構築する。
 * トークン値は一切含まない（有無のみ表示）。
 */
export function buildAuthGuidanceMessage(options: BuildAuthGuidanceOptions): string {
  const { workspaceAliases, hasLegacyUserToken = false, hasLegacyBotToken = false } = options;
  const lines: string[] = [];

  lines.push("Slack トークンが設定されていません。");
  lines.push("");

  if (workspaceAliases.length > 0) {
    // 登録済み workspace がある場合: auth session start を前面に出す
    lines.push("推奨: 登録済みの workspace で認証セッションを開始してください:");
    for (const alias of workspaceAliases) {
      lines.push(`  op read 'op://<vault>/<item>/<field>' | slamy --workspace ${alias} auth session start`);
    }
  } else {
    // 未登録の場合: workspace add → auth session start の順で案内
    lines.push("推奨認証フロー:");
    lines.push("  1. workspace を登録する:");
    lines.push("       slamy workspace add --team-id <id> --alias <alias> --domain <domain>.slack.com --name \"Name\"");
    lines.push("  2. パスワードマネージャー等から stdin 経由でセッションを開始する:");
    lines.push("       op read 'op://<vault>/<item>/<field>' | slamy --workspace <alias> auth session start");
  }

  lines.push("");
  lines.push("現在の状態:");

  if (workspaceAliases.length > 0) {
    lines.push(`  workspace registry: 登録済み（${workspaceAliases.join(", ")}）`);
  } else {
    lines.push("  workspace registry: 未登録（`slamy workspace list` で確認可能）");
  }

  const userStatus = hasLegacyUserToken ? "設定済み（非推奨）" : "未設定";
  const botStatus = hasLegacyBotToken ? "設定済み（非推奨）" : "未設定";
  lines.push(`  SLACK_USER_TOKEN: ${userStatus}`);
  lines.push(`  SLACK_BOT_TOKEN: ${botStatus}`);

  lines.push("");
  lines.push("注意: 環境変数（SLACK_USER_TOKEN / SLACK_BOT_TOKEN）による認証は deprecated（非推奨）です。");
  lines.push("      workspace registry と auth session start の使用を推奨します。");

  return lines.join("\n");
}

export interface TokenPair {
  userToken?: string;
  botToken?: string;
}

export const requireToken = (
  env: NodeJS.ProcessEnv,
  exit: ExitFn,
  log: LogFn,
  workspaceAliases: string[] = [],
): TokenPair | undefined => {
  const userToken = env["SLACK_USER_TOKEN"];
  const botToken = env["SLACK_BOT_TOKEN"];
  if (!userToken && !botToken) {
    const guidance = buildAuthGuidanceMessage({
      workspaceAliases,
      hasLegacyUserToken: false,
      hasLegacyBotToken: false,
    });
    log(`Error: ${guidance}`);
    exit(1);
    return undefined;
  }
  return { userToken, botToken };
};
