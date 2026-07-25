import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cliSource = readFileSync(new URL("../cli/index.ts", import.meta.url), "utf8");

describe("CLI workspace wiring", () => {
  it("defines one root workspace selector and routes every API client through async resolution", () => {
    expect(cliSource).toContain('"--workspace <selector>"');
    expect(cliSource).toContain("createCliApiClient");
    expect(cliSource).not.toContain("const client = createClient();");

    const plainClientUses = cliSource.match(/const client = await createClient\(\);/g) ?? [];
    const targetClientUses = cliSource.match(
      /const \{ client, target \} = await createTargetClient\(/g,
    ) ?? [];
    expect(plainClientUses).toHaveLength(14);
    expect(targetClientUses).toHaveLength(9);
    expect(cliSource).not.toContain("function resolveTarget(");
  });
});
