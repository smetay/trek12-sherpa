// Runs directly under Node 24 (native type stripping) — no build step, no tsx:
//   pnpm bench <command> [options]
import { parseArgs } from 'node:util'
import { compileMap, ENGINE_VERSION, getMapDef, MAPS } from '@trek12/engine'
import {
  getPolicy,
  heuristicPolicy,
  measureRollouts,
  POLICIES,
  parseMcPolicy,
  positionAfter,
  SOLVER_VERSION,
  simulateGame,
  stats,
} from '@trek12/solver'

const USAGE = `Usage: pnpm bench <command> [options]

Commands:
  sim       Simulate games            --map <id> --policy <name> --games <n> --seed <n>
  compare   Paired comparison         --map <id> --policy a,b,c  --games <n> --seed <n>
  perf      Rollouts per second       --map <id> --policy <name> --turns <n> --ms <n>
  version   Print versions
  help      Show this help

Maps: ${MAPS.map((m) => m.id).join(', ')} (default: all real sheets)
Policies: ${POLICIES.map((p) => p.name).join(', ')}, mc<N> (Monte-Carlo advisor, N rollouts per candidate)
`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    map: { type: 'string' },
    policy: { type: 'string' },
    games: { type: 'string', default: '1000' },
    seed: { type: 'string', default: '1' },
    turns: { type: 'string', default: '9' },
    ms: { type: 'string', default: '3000' },
    json: { type: 'boolean', default: false },
  },
})
const command = positionals[0] ?? 'help'
const games = Number(values.games)
const seed = Number(values.seed)
const mapIds = values.map
  ? values.map.split(',')
  : MAPS.filter((m) => m.status !== 'practice').map((m) => m.id)
const policyNames = values.policy ? values.policy.split(',') : ['heuristic']

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const maps = mapIds.map((id) => {
  const def = getMapDef(id) ?? fail(`unknown map "${id}"`)
  return compileMap(def)
})
const policies = policyNames.map(
  (name) => getPolicy(name) ?? parseMcPolicy(name) ?? fail(`unknown policy "${name}"`),
)

const fmt = (x: number, d = 1) => x.toFixed(d).padStart(7)

switch (command) {
  case 'version':
    console.log(`engine ${ENGINE_VERSION}\nsolver ${SOLVER_VERSION}\nnode ${process.version}`)
    break

  case 'sim': {
    for (const map of maps) {
      for (const policy of policies) {
        const t0 = performance.now()
        const scores = new Int32Array(games)
        for (let g = 0; g < games; g++) scores[g] = simulateGame(map, policy, seed + g)
        const ms = performance.now() - t0
        const st = stats(scores)
        const summit = scores.reduce((n, sc) => n + (sc >= map.def.summit ? 1 : 0), 0) / games
        if (values.json) {
          console.log(
            JSON.stringify({
              map: map.def.id,
              policy: policy.name,
              seed,
              ...st,
              pSummit: summit,
              ms,
            }),
          )
        } else {
          console.log(
            `${map.def.id.padEnd(11)} ${policy.name.padEnd(10)} n=${games} mean=${fmt(st.mean)} sd=${fmt(st.sd)} ` +
              `p10=${fmt(st.p10, 0)} med=${fmt(st.median, 0)} p90=${fmt(st.p90, 0)} max=${fmt(st.max, 0)} ` +
              `P(≥${map.def.summit})=${(100 * summit).toFixed(1).padStart(5)}%  ${(games / (ms / 1000)).toFixed(0)} games/s`,
          )
        }
      }
    }
    break
  }

  case 'compare': {
    if (policies.length < 2) fail('compare needs at least two policies (--policy a,b)')
    for (const map of maps) {
      const results = policies.map((policy) => {
        const scores = new Float64Array(games)
        for (let g = 0; g < games; g++) scores[g] = simulateGame(map, policy, seed + g)
        return scores
      })
      const base = results[0]
      console.log(`${map.def.id} — paired on ${games} seeds, baseline ${policies[0].name}`)
      policies.forEach((policy, i) => {
        const st = stats(results[i])
        if (i === 0) {
          console.log(`  ${policy.name.padEnd(10)} mean=${fmt(st.mean)}`)
          return
        }
        let sum = 0
        let sumSq = 0
        for (let g = 0; g < games; g++) {
          const d = results[i][g] - base[g]
          sum += d
          sumSq += d * d
        }
        const meanD = sum / games
        const se = Math.sqrt((sumSq / games - meanD * meanD) / games)
        console.log(
          `  ${policy.name.padEnd(10)} mean=${fmt(st.mean)}  Δ=${fmt(meanD, 2)} ± ${se.toFixed(2)} (95% CI ±${(1.96 * se).toFixed(2)})`,
        )
      })
    }
    break
  }

  case 'perf': {
    const turns = Number(values.turns)
    const budget = Number(values.ms)
    for (const map of maps) {
      const from = positionAfter(map, heuristicPolicy, seed, turns)
      for (const policy of policies) {
        const r = measureRollouts(map, from, policy, seed, budget, () => performance.now())
        console.log(
          `${map.def.id.padEnd(11)} ${policy.name.padEnd(10)} from turn ${turns}: ${r.perSecond.toFixed(0).padStart(7)} rollouts/s ` +
            `(${r.rollouts} in ${budget} ms, mean ${r.meanScore.toFixed(1)})`,
        )
      }
    }
    break
  }

  case 'help':
    process.stdout.write(USAGE)
    break

  default:
    console.error(`Unknown command: ${command}\n`)
    process.stdout.write(USAGE)
    process.exitCode = 1
}
