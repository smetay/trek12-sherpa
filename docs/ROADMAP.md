# Roadmap

Goal: at every dice roll, recommend the best operation **and** the best circle (and which rope links to
draw), given everything already played — strong enough to beat a good human player, running offline on a
phone at the game table.

| Milestone | Scope | Acceptance |
|---|---|---|
| **M0** Scaffold | pnpm monorepo, CI, GitHub Pages, installable PWA with a worker ping | CI + deploy green; app works offline on iOS from the home screen |
| **M1** Engine | Maps schema + validator, state, legal moves incl. rope-link choices, scoring, (de)serialisation | Every rule edge case unit-tested; property tests; golden score examples (88, 76) pass; `docs/RULES.md` |
| **M1b** Maps | Dunai, Kagkot, Dhaulagiri digitised as abstract graphs; in-app verification screen | Maps marked `verified`; rulebook example replayed on the real Kagkot grid scores 88 |
| **M2** Policies + bench | random / greedy / heuristic policies, `pnpm bench sim|compare|perf`, `#/perf` page | Deterministic benchmarks published in `docs/BENCHMARKS.md`; throughput gate met on a phone |
| **M3** Solver | Monte-Carlo root race with common random numbers, exact endgame (≤ 3–4 empty cells), worker pool, weight tuning | Exact == naive expectimax; bit-identical results with 1 vs 4 workers; beats heuristic on paired seeds |
| **M3.5** Jev experiment | Bounded, pre-registered benchmark of TypeSafe AI's Jev as a move picker (bench only, never shipped) | `docs/JEV-EVALUATION.md` |
| **M4** Web UI | Full game flow: dice input, ranked advice with honest uncertainty, manual moves, undo, persistence, FR/EN | ≤ 3 taps per turn; first advice < 200 ms, stable by 1.5 s; Playwright smoke test |
| **M5** v1.0.0 | Offline cold start on iOS, update prompt, accessibility pass, README | Solver's average ≥ the author's own average score |
| **M6+** | Post-game analysis (points lost per turn), opening book, position editor, learned evaluator, Free Solo vs Max, Expedition assist cards, map editor, more maps, Amazonia | — |

Design notes and the solver's rationale live in `docs/ARCHITECTURE.md` and `docs/SOLVER.md` (written
with the milestones that produce them).
