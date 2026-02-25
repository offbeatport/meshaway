# Releasing meshaway

This project uses [Changesets](https://github.com/changesets/changesets) for versioning and publishes to **npm** and **Homebrew** (via a tap).

## Prerequisites

- **npm**: Log in once with `npm login` (or set `NODE_AUTH_TOKEN` for CI). Ensure you have publish access to the `meshaway` package.
- **Homebrew**: A [Homebrew tap](https://docs.brew.sh/Taps) (e.g. `github.com/offbeatport/homebrew-meshaway`) with a `Formula/meshaway.rb` that you update on each release.

## Release flow

### 1. Version and changelog

When you’re ready to release:

```bash
pnpm run release:version
```

This runs `changeset version` and `pnpm install`. It will:

- Bump the version in `package.json` from your changesets
- Update the changelog (e.g. `CHANGELOG.md`)

**Review and edit the changelog** if you want, then continue.

### 2. Publish to npm

```bash
pnpm run release:publish
```

This builds the package and runs `changeset publish`, which publishes the new version to the npm registry.

(One-shot: `pnpm run release` does version + install + build + publish without a pause to edit the changelog.)

### 3. Update and publish the Homebrew formula

The formula installs from the **npm tarball**, so the version must be published to npm first.

Generate the formula for the version you just published (use the version that’s now in `package.json`):

```bash
pnpm exec tsx scripts/update-homebrew-formula.ts
# or for a specific version:
pnpm exec tsx scripts/update-homebrew-formula.ts 1.2.3
```

This writes `scripts/homebrew/meshaway.rb`. Copy it into your tap:

```bash
cp scripts/homebrew/meshaway.rb /path/to/homebrew-meshaway/Formula/meshaway.rb
cd /path/to/homebrew-meshaway
git add Formula/meshaway.rb
git commit -m "meshaway <version>"
git push
```

Users who have tapped your repo can then run:

```bash
brew update
brew upgrade meshaway
```

## Summary

| Step | Command |
|------|--------|
| Version + changelog | `pnpm run release:version` |
| Edit changelog | Open `CHANGELOG.md` |
| Publish to npm | `pnpm run release:publish` |
| Generate Homebrew formula | `pnpm exec tsx scripts/update-homebrew-formula.ts` |
| Publish to Homebrew | Copy formula to tap, commit, push |

## Optional: GitHub Releases and native binaries

If you also want to ship **native binaries** (from `pnpm run build:native`) via GitHub Releases:

1. Create a new release in the GitHub UI (or with `gh release create`) and upload the `release/meshaway-*` executables.
2. You can add a separate Homebrew formula that uses those assets instead of the npm tarball (e.g. for a “no Node required” install). The current formula uses npm and `depends_on "node"` so users get the same package as `npm install -g meshaway`.
