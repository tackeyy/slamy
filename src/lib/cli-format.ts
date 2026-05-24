// CLI 出力フォーマットの純粋関数群。
// src/cli/index.ts から import して使い、テストもここを直接呼ぶ。
// こうすることで実 CLI の出力仕様が変わったらテストも追従する。

export const jsonOutput = (data: unknown): string =>
  JSON.stringify(data, null, 2);

export const tsvRow = (cells: Array<string | number>): string =>
  cells.join("\t");

export const humanChannelLine = (
  name: string,
  id: string,
  isPrivate: boolean,
  count: number,
  countLabel: "unread" | "members" = "unread",
): string => {
  const priv = isPrivate ? " (private)" : "";
  return `#${name.padEnd(30)} ${id}${priv}  [${count} ${countLabel}]`;
};
