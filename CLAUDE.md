# Trek12 Sherpa — guide for AI assistants and contributors

Unofficial best-move advisor for the board game **Trek 12**. Offline-first PWA on GitHub Pages;
all computation happens in the browser. Roadmap: `docs/ROADMAP.md`.

## Commands

```bash
pnpm install                 # Node 24 + pnpm 10 (version pinned in package.json)
pnpm check                   # everything CI runs: biome ci, typecheck, tests, build, hygiene
pnpm test                    # vitest (FC_RUNS=5000 FC_SEED=123 pnpm test for a deep property run)
pnpm dev                     # web app dev server
VITE_BASE=/trek12-sherpa/ pnpm build && pnpm preview   # production build under the Pages sub-path
pnpm bench <command>         # Node CLI (apps/bench), runs TypeScript directly via Node type stripping
```

## Layout

- `packages/engine` — the rules. Pure TypeScript, **zero dependencies, no DOM, no Node** (tsconfig `types: []`).
  `docs/RULES.md` is the source of truth for every interpretation; a rule change = RULES.md + test + code.
- `packages/solver` — policies, Monte-Carlo root search, exact endgame, worker-pool protocol. Environment-agnostic.
- `apps/web` — Vite + React + Tailwind PWA. Workers live in `src/worker/` (own tsconfig with the WebWorker lib).
- `apps/bench` — Node CLI: simulations, comparisons, throughput, weight tuning, the Jev experiment.
- `reference/` — **git-ignored**. Sheet photos and rulebook PDFs live there and nowhere else.

## Hard rules

1. **Never commit** sheet photos, scans, artwork, rulebook text, or API keys. Maps are abstract graph
   data only (`cells`, `edges`, `max`), rendered with our own neutral drawing. `pnpm hygiene` enforces it.
2. Engine and solver stay pure: no I/O, no globals, no `Date.now()` — inject a clock / seed.
3. Everything that involves randomness takes an explicit seed and is reproducible (tests, bench, solver).
4. Hot paths (`packages/engine/src`, `packages/solver/src`): typed arrays, integers, no allocation in loops,
   no enums (`erasableSyntaxOnly`), no closures/iterators inside rollouts. Measure before optimising.
5. Relative imports carry the `.ts` extension (`allowImportingTsExtensions` + Biome `useImportExtensions`).
6. Code, comments, commits and docs in English; the UI is French first, English second.
7. Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`…); PRs are squash-merged.

## Verifying changes

- Rules: unit test per rule edge case + the golden score examples (`88` and `76`) + fast-check invariants.
- Solver: seed-deterministic tests only (no wall-clock budgets in tests; use rollout counts).
- Web: `pnpm build` then `pnpm preview` — the production build (workers, service worker, base path)
  differs from the dev server. Real-device check on iOS Safari before a release.
