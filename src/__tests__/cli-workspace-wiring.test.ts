import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cliSource = readFileSync(new URL("../cli/index.ts", import.meta.url), "utf8");

describe("CLI workspace wiring", () => {
  it("defines one root workspace selector and routes every API client through async resolution", () => {
    expect(cliSource).toContain('"--workspace <selector>"');
    expect(cliSource).toContain("createCliApiClient");
    expect(cliSource).not.toContain("const client = createClient();");

    const clientUses = cliSource.match(/const client = await createClient\(\);/g) ?? [];
    expect(clientUses).toHaveLength(23);
  });
});
