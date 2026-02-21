import { describe, it, expect } from "vitest";
import { fixSlackMrkdwn } from "../mrkdwn.js";

describe("fixSlackMrkdwn", () => {
  // Go 版テストケース完全移植 (14件)
  const cases: { name: string; input: string; expected: string }[] = [
    {
      name: "FullwidthColonAfterBold",
      input: "*住所*：東京",
      expected: "*住所*: 東京",
    },
    {
      name: "FullwidthParenAfterBold",
      input: "*金融ch*（17件）",
      expected: "*金融ch* （17件）",
    },
    {
      name: "FullwidthBracketAfterBold",
      input: "*重要*「注意」",
      expected: "*重要* 「注意」",
    },
    {
      name: "FullwidthCommaAfterBold",
      input: "*項目*、次",
      expected: "*項目* 、次",
    },
    {
      name: "AsciiAfterBold_NoChange",
      input: "*bold* text",
      expected: "*bold* text",
    },
    {
      name: "HalfwidthColonAfterBold_NoChange",
      input: "*label*: value",
      expected: "*label*: value",
    },
    {
      name: "MultipleFixesInText",
      input: "*住所*：東京\n*金額*（100万円）",
      expected: "*住所*: 東京\n*金額* （100万円）",
    },
    {
      name: "NonBoldAsterisk_NoChange",
      input: "5 * 3 = 15：答え",
      expected: "5 * 3 = 15：答え",
    },
    {
      name: "DoubleAsteriskToSingle",
      input: "**太字**テスト",
      expected: "*太字* テスト",
    },
    {
      name: "EmptyString",
      input: "",
      expected: "",
    },
    {
      name: "DoubleAsteriskWithFullwidthColon",
      input: "**見出し**：内容",
      expected: "*見出し*: 内容",
    },
    {
      name: "EmojiAfterBold",
      input: "*結果*🔴失敗",
      expected: "*結果* 🔴失敗",
    },
    {
      name: "MultipleBoldsOnSameLine",
      input: "*A*（1）と*B*（2）",
      expected: "*A* （1）と*B* （2）",
    },
    {
      name: "OnlyASCII_NoChange",
      input: "Hello *world* test",
      expected: "Hello *world* test",
    },
  ];

  for (const { name, input, expected } of cases) {
    it(name, () => {
      expect(fixSlackMrkdwn(input)).toBe(expected);
    });
  }
});
