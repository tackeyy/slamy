# Changesets

This project uses [changesets](https://github.com/changesets/changesets) to manage versioning and changelogs for the npm package `slamy`.

## How to add a changeset

When you make a change that should be released to npm, run:

```bash
npx changeset
```

This will prompt you to:

1. Choose the semver bump type (`major`, `minor`, or `patch`)
2. Write a short summary of your changes (becomes the changelog entry)

Commit the generated changeset file (`.changeset/<random-name>.md`) along with your changes.

## Release process

Releases are automated via GitHub Actions (`.github/workflows/release.yml`).

When changesets are merged to `main`:

1. A "Version Packages" PR is automatically opened by [changesets/action](https://github.com/changesets/action)
2. The PR bumps `package.json` version, updates `CHANGELOG.md`, and removes consumed changeset files
3. Merging that PR triggers an npm publish and creates a GitHub Release

## Semver guidelines

- `patch` — bug fixes, documentation updates, internal refactors
- `minor` — new CLI commands, new MCP tools, non-breaking option additions
- `major` — breaking changes (CLI flag rename/removal, output format changes, MCP tool removal)

## Note on the Go binary

This `.changeset/` workflow only covers the npm package. The Go binary in `go-src/` is released independently via `goreleaser` (`.github/workflows/release.yml` triggered on `v*` tags).
