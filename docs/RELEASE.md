# Release

**Summary (e.g. for GitHub release notes):**  
Hub UI: shared empty state, version in sidebar, light-theme tweaks (sidebar hover, Playground code/console, borders). Release: VERSION synced from package.json via `scripts/sync-version.ts`. Docs: `docs/RELEASE.md` release steps.

```bash
pnpm changeset add
pnpm run version
# Edit CHANGELOG.md if needed, then commit
pnpm run build:native
pnpm run release:npm
pnpm run release:github
pnpm run release:homebrew
```
