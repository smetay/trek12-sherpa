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
| **v1.1.0** | Solver: exact last turn inside every rollout, exact endgame extended to 3 empty cells (last-ply table + memoisation, spread over workers), cross-entropy weight tuning (`pnpm bench tune`). UI: expected final score and summit chance shown throughout the game, tap an operation to see where it is best (with each operation's cost in the choice table), dice drawn like the real ones |

| **v1.2.0** | Post-game analysis ([ANALYSIS.md](ANALYSIS.md)): clairvoyant maximum of a roll sequence (beam search → parallel tempering in lanes → exact polish), the Sherpa's own game on the same dice, review of every decision (pinned moves in the race), order-of-play reconstruction of paper sheets with diagnosis, optional order entry, count check; on-device reading of photographed dice logs and ascent sheets (`packages/vision`, CNN trained on MNIST) |

## Next

1. **Stronger solver** — exact solve at 4 empty cells within a node budget; tune the rollout policy
   against the Monte-Carlo objective itself rather than the greedy proxy.
2. **Better photo reading** — read the rope links and the ticked boxes of a scanned sheet (they pin
   down part of the order of play); collect consented real samples to fine-tune the digit model.
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
