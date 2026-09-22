# Rules as implemented

This document is the source of truth for `packages/engine`: every rule the engine enforces, in our own
words, with the reading we chose wherever the rulebook leaves room. A rule change means changing this
file, a test, and the code — in that order.

Sources: the official French rulebook (*Manuel du Trekkeur*, Lumberjacks Studio — both the 2020 first
printing and the later printing whose cover lists three game modes), the English edition (Pandasaurus,
2022), and the designer's clarification of the rope-link rule on the Tric Trac forum (2020). No
rulebook text is reproduced here; page references point to the French booklet.

## Components (p. 2)

- One yellow die with faces **0–5**, one red die with faces **1–6**. 36 equiprobable outcomes.
- An ascent sheet: **19 circles**, some with a thick outline (*dangerous*), a 5 × 4 choice table, the
  bonus table, and the score sheet.

## A turn (p. 4)

1. Roll both dice.
2. Choose **one** operation: the **lower** die, the **higher** die, the **difference** (never negative,
   may be 0), the **sum**, or the **product**. Tick one of the **4 boxes** of that operation; an
   operation with all boxes ticked is no longer available. (`opLimits`, per map — expansion sheets use
   other allowances.)
3. Write the result in a circle: **anywhere on turn 1**, then only in an empty circle **adjacent to a
   circle already filled**.
4. Apply the consequences immediately: rope links and/or zone.

19 circles, 20 boxes: an operation is always available. A game always ends after exactly 19 turns.

## Circle limits (p. 6)

- Normal circle: **0–12**. Dangerous circle (thick outline): **0–6**.
- A result above the limit — chosen or forced — is not written; a **☹** goes in the circle instead.
  A ☹ is not a number: it joins no rope path and no zone, and costs 3 points at the end.
- Only the product can exceed 12 (9 of the 36 rolls). 7 and 11 only come from the sum, 12 only from the
  product (3 rolls), 11 from a single roll (5 + 6).

## Rope paths — *chemins de corde* (p. 5)

A rope path is a sequence of adjacent circles holding **exactly consecutive numbers** (ascending or
descending along the path).

- Links are drawn **at the moment a number is written**: the new number is linked to a neighbouring
  `v − 1` and/or a neighbouring `v + 1`. A link that was not drawn at that moment is never drawn later.
- Each number belongs to **at most one** rope path, and a path never contains the same number twice.
  Consequently a number has at most one "down" link (to `v − 1`) and one "up" link (to `v + 1`), and
  a path is a simple, monotone sequence. A neighbour is *eligible* only if the matching slot is free:
  a `v − 1` whose up-slot is free, a `v + 1` whose down-slot is free.
- Several eligible neighbours with the **same** value (two 6s next to a new 5): the player links
  **exactly one** of them. This is a real decision and the engine generates one move per option.
- Linking both a `v − 1` and a `v + 1` **merges** two paths into one. The designer confirmed that
  writing a 4 between 1-2-3 and 5-6-7 merges them into a single path ("c'est même bien joué").
- **Score:** highest number of the path + 1 per other circle. With consecutive values this equals
  `2 · max − min`. A single unlinked number is not a path.

### Links are mandatory (`linkRule: 'mandatory'`, default)

The first printing of the French rulebook only implies it (imperative wording); the English edition
and the **later French printing** (the one that lists three game modes on its cover) state it outright:
when a link can be drawn it **must** be drawn; among several eligible neighbours holding the **same**
number you must pick **exactly one**; when the eligible neighbours hold **two different numbers**
(`v − 1` and `v + 1`) you must link **both**. The later printing's own example writes an 11 between a
10 and a 12 with two links.

So **every eligible link is drawn, including a merge**, the only freedom being the choice among
same-valued neighbours. This matters strategically — merging [5-6] and [8-9] through a 7 scores 13
instead of 7 + 10 (before the length bonus), so a player who *could* avoid the merge would sometimes
want to; the rules do not allow it.

`linkRule: 'optional'` is kept as a house variant (any eligible link may be skipped) so that the two
readings can be compared in the benchmarks. Every game record stores its ruleset.

## Zones (p. 6)

A zone is a group of **at least 2 adjacent circles holding the same number**. Zones form
automatically — the engine derives them from the numbers, no choice involved. A circle can belong to a
zone **and** a rope path at the same time.

**Score:** the number + 1 per other circle (`v + size − 1`). A zone of 0s scores its size minus one.

## End of the game (p. 7)

`Σ rope paths + BONUS(longest path) + Σ zones + BONUS(largest zone) − 3 × (☹ count)`

- **Bonus table** (size → points): 3 → 1, 4 → 3, 5 → 6, 6 → 10, 7 → 15, 8 → 20, 9 → 25, then **+5 per
  additional circle** (10 → 30, 11 → 35…). Paid once for the single longest path and once for the
  single largest zone; ties change nothing since the bonus depends on size only.
- **☹ count** = over-limit circles + **orphans**: numbers that belong to neither a path nor a zone.
  Each costs **3 points**.

Worked examples reproduced by `packages/engine/test/golden.test.ts`: the French booklet example scores
**88** (paths 13 + 14 + 5 + 13 with a 20-point bonus for an 8-circle path, zones 13 + 8 + 4 with a
1-point bonus, one orphan); the English booklet example scores **76** (paths 14 + 14 + 13 + 3, zones
13 + 4, two ☹).

## Interpretations not covered by the rulebook

| Question | Our reading | Why |
|---|---|---|
| Does a ☹ circle count as "filled" for the adjacency rule? | **Yes.** | Something was drawn in it; the rulebook only says "a circle you've already filled". The opposite reading makes the game unplayable when the first number written is a ☹ (nothing would be adjacent to a filled circle), so it cannot be intended. |
| Can a ☹ link or form a zone? | **No.** | Explicit in both booklets: a ☹ is not a number. |
| May a player decline an eligible link, or skip one side of a merge? | **No**; `optional` variant available for comparison only. | Explicit in the later French printing and the English edition — see *Rope paths* above. |
| Which of several same-valued eligible neighbours to link? | Player's choice. | Explicit in the French rulebook; each option is a distinct move. |
| Can a path contain both a `v − 1` link and a `v + 1` link on the same circle? | Yes — that is the merge. | Designer's clarification. |
| Is the bonus paid for each path/zone that ties for the longest/largest? | Once. | The rulebook speaks of *your longest path* and *your largest zone*, singular; the printed sheet has one box for each. |

## Not modelled yet

Expedition mode (assist cards, guides, reputation stars, sealed envelopes), Free Solo (the virtual
opponent "Max"), expansion sheets with pre-linked circles (Jampa) or special circles (Zen Trek, Trek at
Home), and Trek 12: Amazonia. See `docs/ROADMAP.md`.
