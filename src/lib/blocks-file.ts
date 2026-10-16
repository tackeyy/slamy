/**
 * --blocks-file の JSON を読む。読めない・JSON でないときは、パスや中身（秘密を含みうる）を含まない固定の文面で失敗する。
 * ファイルの読み込みは呼び出し側（cli）が渡す。blocks の形（空でない配列・object の要素）の検査は postMessage が行う。
 */
export function readBlocksFile(read: () => string): unknown {
  try {
    return JSON.parse(read());
  } catch {
    throw new Error("Could not read --blocks-file as a JSON blocks array");
  }
}
