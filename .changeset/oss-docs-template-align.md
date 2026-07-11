---
"slamy": patch
---

Repository hygiene: align docs and config with the OSS Node.js template.

- Migrate `tsconfig.json` to `module: NodeNext`, `target: ES2023`, and
  `verbatimModuleSyntax: true` for consistent ESM builds. **Downstream consumers
  importing `slamy` from TypeScript:** relative imports inside this package now
  require `.js` extensions in source. Public API surface is unchanged.
- Extract CLI helpers (`jsonOutput`, `requireToken`) into `src/lib/cli-format.ts`
  and `src/lib/cli-errors.ts` so unit tests can exercise the same code the CLI
  runs.
- Add SECURITY.md, dependabot config, markdown/yaml lint, vitest coverage
  thresholds, ci.yml, and a changesets-based npm release workflow.
