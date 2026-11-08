# Post-game analysis

`#/review` in the app, "Analyser une partie" on the home screen. After a game played on paper (or in
the app), the players enter — or photograph — the 19 rolls and their sheets, and get three answers:

1. **The best score these dice allowed** (the clairvoyant maximum, every roll known in advance).
2. **What the Sherpa would have scored** on the same dice, deciding turn by turn without seeing ahead.
3. **Where each player lost points**: every decision rated by the expected points it cost.

Code: `packages/solver/src/hindsight` (maximum), `packages/solver/src/review` (order reconstruction,
review), `packages/vision` (photo reading), `apps/web/src/pages/ReviewPage.tsx` and
`apps/web/src/components/review/` (UI).

## Three numbers, three meanings

The page never mixes them, because they answer different questions:

| Number | Question | Fair to compare a player with? |
|---|---|---|
| Clairvoyant maximum | What did these dice allow at best? | No — a ceiling: it uses rolls nobody could know. |
| Sherpa on the same dice | What would a strong player have scored here? | Yes — same information as the player. |
| Points lost in decisions | Which of my choices were wrong, and by how much? | Yes — each turn judged with what was known then. |

They are shown together on one axis (*Toi · Sherpa · Max*) so a player immediately sees whether a low
score came from the dice (low maximum), from their decisions (large gap to the Sherpa) or both.

## The clairvoyant maximum

With all rolls known the game is a deterministic puzzle: choose, for each of the 19 turns, an
operation and a circle so that the final sheet scores most. It is hard — 19 turns with 10 to 95 legal
moves each, and the best sheets exploit what is special about the dice (a zone of eight 2s when 2 comes
up often, an 11–12 chain when the single 5 + 6 roll arrives late…).

The search refines in three stages (benchmarks in [BENCHMARKS.md](BENCHMARKS.md#clairvoyant-maximum-solver-040)):

1. **Beam search** (width 256, Zobrist-merged transpositions, an evaluation that credits open chain
   ends, rescuable orphans and growable zones by how many of the *remaining known rolls* can produce
   the number they need) gives a good legal line in ~0.1 s.
2. **Parallel tempering** over *plans* (turn → circle, operation, link variant). A plan is replayed
   in 19 incremental moves, so a thread evaluates about a million plans per second. Proposals: change
   an operation, swap two turns' operations or circles, and — the one that made the difference —
   *reorder turns while keeping the numbers on the sheet* (rotate the circles of turns a..b and pick,
   for each turn, an operation that reproduces the number its new circle already holds). Sixteen
   replicas between 0.25 and 6 points of temperature swap configurations every 200 proposals.
   Simulated annealing restarts get stuck in separate basins; tempering at half the budget beat a
   50-million-proposal annealing reference.
3. **Lanes and rounds.** Four lanes (one per worker) run rounds of tempering (100 000 proposals per
   replica). After each round the weaker of the two *elite* lanes restarts from the overall best; the
   two other lanes always continue their own search, so that their agreement is evidence rather than
   a copy. The search runs 4 to 10 rounds and stops after three rounds without progress (30 s at most
   in the app), and every result has its **last six turns solved exactly** (depth-first search with a
   transposition table).

The app shows the **best score found**, the number of lanes that reached it *by their own search*
("3 recherches indépendantes sur 4 trouvent ce score"), and offers *Chercher encore*, which continues
from the best line. It never claims a proof, and agreement is not one: on 36 roll sequences over
the three sheets the shipped search ends 0.25 to 0.75 point below the best line ever found for them
on average (by any run, some several times longer), exactly on it for 29 of the 36 — and once three
independent lanes agreed on 99 where 103 exists. For scale, knowing the dice in advance is worth 22
to 27 points over the Sherpa's own play. A first draft of this search (lighter rounds, elitism in
every lane, which made the lanes copy each other) was 2.25 points below on Kagkot while displaying a
misleading "4/4 agree"; measuring it is what changed the design.

## The review

### Games recorded in the app

The order of play is known: each turn is replayed and the Monte-Carlo advisor (the same as during a
game, ~0.9 s per turn) ranks every legal move. The move played is **pinned** in the race so it is
never eliminated early: its value is measured as precisely as the leader's, and the loss is a paired
difference with its own confidence interval. The last turns are solved exactly.

Grades, chess-style: *bon coup* (tied with the best or < 0.5 point), *imprécision* (< 2), *erreur*
(< 5), *grosse erreur* (≥ 5). Losses add up to *points perdus en décisions*.

### Paper sheets: the order of play is missing

A finished sheet says which number is in which circle, not when it was written — and a typical sheet
is compatible with **millions** of orders. `SheetReconstructor` handles this exactly:

- **Feasibility** of "these dice can produce this sheet" is a DP over (filled circles, ticked boxes):
  rope links never decide whether a move is legal, only which links it draws, so they can be left out.
  Memoised, with a bipartite matching (turns ↔ circles) that cuts hopeless branches early.
- **Diagnosis** when a sheet is impossible, to catch typing or reading errors: circles whose number
  no roll can produce, numbers more frequent than the rolls that produce them (unmatched circles of
  a maximum matching), or — when the counts work but no order does — the circles which, if wrong,
  would explain it. They are outlined in red on the sheet.
- **Candidates**: at each turn, the moves that write the target number *and* keep a completion
  possible.

Without more information the review gives the player the benefit of the doubt: at an ambiguous turn
it keeps the compatible move the advisor rates highest, marks the turn *ordre déduit*, and says that
the per-turn losses are indicative. Two ways to make them exact:

- **Préciser l'ordre de jeu** (optional, before the analysis): the player taps, turn by turn, the
  circle they filled; only the circles the dice and the sheet allow are offered, forced turns fill
  themselves, and "let the review infer the rest" stops at any point. No search involved — instant.
- **After the analysis**, an inferred turn lists the other possible moves; tapping the one actually
  played re-runs the review from that turn only (earlier turns are reused).

### Checking the count

The rope links depend on the order of play too, so the same numbers can be worth several totals
(41 to 49 on one test sheet). The count a player wrote on paper is checked against the range of
totals of sampled compatible orders, never against a single arbitrary one: a correct count is never
flagged as wrong.

## Reading photos (`packages/vision`)

Everything runs on the device, in a Web Worker: no network, no account, nothing leaves the phone.

- **Dice log** — the players' own sheet: one line per roll, yellow die then red die (row numbers,
  title lines and ruled lines are expected and ignored). Adaptive binarisation, removal of ruled lines
  that keeps strokes crossing them, glyph grouping, header detection, separator and columns, rows
  paired by height (a skipped ruled line keeps its place).
- **Ascent sheet** — the player taps four indicated circles; the app knows every sheet's layout, so
  four points fix the perspective. Each circle is re-centred on its printed ring, its inside read as
  0–12 or ☹, constrained by the circle's limit.
- **Digits** — a small CNN (two 5×5 convolutions, ~20 k parameters, int8 weights) trained on MNIST
  plus synthetic ☹ faces, European-style 1s and crossed 7s. Every glyph, in training as in use, is
  skeletonised and redrawn with a fixed pen width, which removes most of the gap between a pen photo
  and MNIST. Decoding is constrained (a yellow die is 0–5, a red die 1–6, a dangerous circle 0–6 or
  ☹), and each value carries a confidence. 98.1 % on the 10 000 MNIST test digits; reproducible
  training (`node apps/bench/src/ocr-train.ts`, command and seed in the header of `model-weights.ts`,
  MNIST in the git-ignored `.cache/`).

Measured on the one real dice log available during development (kept out of the repository): 11 of
the 12 dice right at full size, 1600 and 1200 px, rows found exactly (empty ruled lines skipped). The
miss is a red 4 drawn in one stroke with a loop, read as 6 — with high confidence, so it is not always
ringed in orange. That is why the scan ends on a review screen with every crop next to its value:
checking takes a glance, correcting a tap. The sheet reader is validated on synthetic perspective
sheets only (17–19 of 19 circles per test sheet); shaded zones or a rope link drawn across a digit
can disturb a reading, and the consistency check against the dice catches most such errors.

## Interface decisions

- **Input first, computation last, never blocking.** Typing the dice and the sheets is instant and
  local; the maximum starts by itself once the 19 rolls are known and streams its best score; each
  player's review starts on demand and fills in turn by turn. Computations run one at a time on the
  shared workers and are dropped as soon as the data they were started from changes.
- **Fast entry.** The 19 rolls fit on one phone screen as a 5-column grid of die pairs; a docked
  keypad (the same die faces as during a game) jumps to the next missing roll as soon as both dice
  are set. Power users paste "54 16 55…". Sheets are typed with a 0–12 + ☹ pad that walks to the next
  empty circle; dangerous circles only offer 0–6 and ☹, as on paper.
- **Scanning is an accelerator, never a trap.** Every read value can be corrected by the same tap
  as manual entry; low-confidence values are ringed in orange and the photo crop is shown next to the
  keypad, so checking costs one glance. A sheet that the dice cannot produce is caught before any
  analysis, with the guilty circles outlined.
- **Honesty about uncertainty.** "Best score found" with the agreement of independent searches, not
  a fake proof; inferred orders are labelled and correctable; tied moves count as good moves.
- **One page, top to bottom**: sheet → dice → maximum → Sherpa → players. Everything is visible and
  editable at any time (no wizard to step back through), and the whole session survives a reload.
- **Multi-player by design**: Trek 12 players share the dice, so one dice log serves every sheet.
- Accessible like the rest of the app: real buttons, labelled circles, progress bars with values,
  colour never the only signal (grades also have a symbol or a number).
