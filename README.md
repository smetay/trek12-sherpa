# Trek12 Sherpa

> Unofficial best-move advisor for the roll-and-write board game **Trek 12**.
> Enter the two dice, get the best operation **and** the best circle to write it in — turn after turn, based on everything you have already played.

🚧 **Work in progress** — the project is being built in the open. See the [roadmap](docs/ROADMAP.md).

- **Offline-first PWA**: runs entirely in your browser (phone at the game table, no account, no server, no tracking).
- **Real solver, not vibes**: Monte-Carlo search guided by a tuned heuristic, with the last turns of the game solved _exactly_.
- **Honest advice**: moves that are statistically tied are shown as tied.

## Status

| Milestone | State |
|---|---|
| M0 — repo scaffold, CI, GitHub Pages | ✅ |
| M1 — rules engine, the three base sheets digitised and verified | ✅ |
| M2 — policies + benchmark harness | 🚧 next |
| M3 — Monte-Carlo solver + exact endgame | ⏳ |
| M4 — web UI | ⏳ |
| M5 — v1.0.0 | ⏳ |

## En français

Trek12 Sherpa est un conseiller de coups **non officiel** pour le jeu de société **Trek 12** : tu saisis les deux dés, il te recommande la meilleure opération et la meilleure case, en tenant compte de tout ce que tu as déjà joué. L'application fonctionne hors-ligne, directement dans le navigateur de ton téléphone. Projet en cours de construction.

## Disclaimer

Trek12 Sherpa is an **unofficial, fan-made, non-commercial** tool. It is not affiliated with, endorsed by, or sponsored by Lumberjacks Studio, Kodama Games, Pandasaurus Games, or the designers Bruno Cathala and Corentin Lebrat. _Trek 12_ is a trademark of its respective owners.

This repository contains **no artwork, no scans and no rulebook text** from the game. Maps are stored as abstract graph data only (which circles touch, which ones are dangerous) and are drawn with the project's own neutral rendering. **You need to own the game to use this tool.**

If you are a rights holder and have any concern, please [open an issue](../../issues) — it will be addressed promptly.

## License

[MIT](LICENSE) © Sébastien Metay
