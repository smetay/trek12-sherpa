# Roadmap

Goal: at every dice roll, recommend the best operation **and** the best circle (and which rope links to
draw), given everything already played — strong enough to beat a good human player, running offline on a
phone at the game table.

## Done — v1.0.0

| Milestone | Scope |
|---|---|
| **M0** Scaffold | pnpm monorepo, CI, GitHub Pages, installable offline PWA |
| **M1** Engine | Map schema + validator, state, legal moves incl. rope-link choices, incremental scoring, validated replay; rulebook examples (88, 76), property tests, `docs/RULES.md` |
| **M1b** Maps | Dunai, Kagkot, Dhaulagiri digitised from photos and verified circle by circle on physical sheets |
| **M2** Policies + bench | random / greedy / heuristic policies, `pnpm bench sim\|compare\|perf`, `#/perf` page, `docs/BENCHMARKS.md` |
| **M3** Solver | Monte-Carlo root race with common random numbers, successive halving, exact endgame, worker pool; +22 to +25 points over the heuristic (`docs/SOLVER.md`) |
| **M4** Game UI | Dice input, ranked advice with honest ties, manual moves with link choice, undo/redo, persistence, FR/EN, Playwright smoke test |
| **M5** v1.0.0 | Sheet heatmap (value to write + points lost in every playable circle, ★ on the best), "score sheet" light/dark theme with a legibility-first typeface, collapsed dice, accessibility pass, README |

## Next

1. **Stronger, faster solver** — end every rollout with the exact expectation of the last turn; make
   3-empty positions exact; tune the rollout policy by cross-entropy on generated maps.
2. **Post-game review** — replay a finished game and show the points lost at each turn.
3. **Jev experiment (M3.5)** — bounded, pre-registered benchmark of TypeSafe AI's Jev as a move picker
   (bench only, never shipped). Needs an API key in a local `.env`.
4. **Free Solo** — model the virtual opponent "Max" (same circle, higher die, +3 per orphan) and optimise
   the margin over him.
5. **More sheets** — expedition envelopes (Pokhara, Dhye, Machapuchare), Trek 12+1 (Jampa: uneven
   operation limits and pre-linked circles), community maps via an in-app map editor.
6. **Expedition mode** — assist cards (compass, schnapps, rope, tent…) and guides.
7. **Learned evaluator** — linear model then n-tuple network under a 1-ply expectimax, shipped only if
   it beats the Monte-Carlo advisor at equal time.
8. **Trek 12: Amazonia** — rivers, animal observations, different scoring.
