# Publishing meshaway to Homebrew

This is a minimal guide if you’ve never published a Homebrew formula.

## What you need

- A **tap** = a GitHub repo whose name is `homebrew-<something>`.  
  For meshaway people use `homebrew-meshaway` (repo: `github.com/offbeatport/homebrew-meshaway`).
- The repo must have a folder **`Formula/`** and inside it a file **`meshaway.rb`** (the “formula” = recipe Homebrew uses to install your app).

You don’t install anything special on your Mac; `brew` will use that GitHub repo when users run `brew install meshaway` (after they’ve added your tap).

## One-time setup: create the tap repo

1. On GitHub, create a **new repository**.
2. Name it **`homebrew-meshaway`** (the `homebrew-` prefix is required so `brew tap` can find it).
3. Clone it on your machine:
   ```bash
   git clone https://github.com/offbeatport/homebrew-meshaway.git
   cd homebrew-meshaway
   ```
4. Create the formula directory and add a placeholder so the repo has the right structure:
   ```bash
   mkdir -p Formula
   touch Formula/meshaway.rb
   git add Formula/meshaway.rb
   git commit -m "Add meshaway formula"
   git push origin main
   ```
   (You’ll replace `Formula/meshaway.rb` with the real formula in the next section.)

After this, you only need to **update** `Formula/meshaway.rb` on each release.

## Every release: update the formula and push to Homebrew

Do this **after** you’ve created the GitHub release (with the 6 binary archives) for the new version.

In the meshaway repo, run:

```bash
pnpm run release:homebrew
```

This will:

1. Generate **`scripts/homebrew/meshaway.rb`** from the GitHub release (version + SHA256 from `package.json`).
2. Clone **offbeatport/homebrew-meshaway** to `../homebrew-meshaway` if it isn’t there already.
3. Copy the formula into the tap, then **commit and push**.

You can override the tap location with **`HOMEBREW_TAP_PATH`** (default: `../homebrew-meshaway`).

Done. Users (who have tapped your repo) get the update with:

```bash
brew update
brew upgrade meshaway
```

New users can install with:

```bash
brew tap offbeatport/meshaway
brew install meshaway
```

(Replace `offbeatport` with your GitHub org or username if different.)

## Summary

| What | Where |
|------|--------|
| Tap repo | `github.com/offbeatport/homebrew-meshaway` |
| Formula file | That repo’s `Formula/meshaway.rb` |
| One command | `pnpm run release:homebrew` — generates formula, clones tap if needed, copies, commits, pushes |
