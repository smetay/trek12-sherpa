# Contributing

Thanks for your interest! Issues and pull requests are welcome, in English or French.

## Setup

```bash
git clone https://github.com/smetay/trek12-sherpa.git
cd trek12-sherpa
corepack enable   # or install pnpm 10 yourself
pnpm install
pnpm check        # lint, typecheck, tests, build, hygiene — the same as CI
pnpm dev          # web app on http://localhost:5173/trek12-sherpa/
```

Requires Node 24+. The bench CLI runs TypeScript directly (`pnpm bench help`).

## Workflow

1. Open an issue first for anything beyond a small fix, so we can agree on the approach.
2. Branch from `main`, keep PRs focused, use [conventional commits](https://www.conventionalcommits.org/).
3. `pnpm check` must pass. Rule changes need a matching update to `docs/RULES.md` and a test.
4. PRs are squash-merged; CI deploys `main` to GitHub Pages automatically.

## What must never be committed

- Photos, scans or artwork of the game sheets, and rulebook text — they are copyrighted.
  Maps are contributed as abstract graph data only (see `packages/engine/src/maps/`).
- Secrets (`.env` is git-ignored; the web app never uses any).

See `CLAUDE.md` for the code conventions (it is written for AI assistants but applies to humans too).
