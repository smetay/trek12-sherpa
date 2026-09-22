// Runs directly under Node 24 (native type stripping) — no build step, no tsx:
//   pnpm bench <command> [options]
import { parseArgs } from 'node:util'
import { ENGINE_VERSION } from '@trek12/engine'
import { SOLVER_VERSION } from '@trek12/solver'

const USAGE = `Usage: pnpm bench <command>

Commands:
  version   Print engine and solver versions
  help      Show this help

Planned (see docs/ROADMAP.md): sim, compare, perf, tune, jev
`

const { positionals } = parseArgs({ allowPositionals: true, strict: false })
const command = positionals[0] ?? 'help'

switch (command) {
  case 'version':
    console.log(`engine ${ENGINE_VERSION}\nsolver ${SOLVER_VERSION}\nnode ${process.version}`)
    break
  case 'help':
    process.stdout.write(USAGE)
    break
  default:
    console.error(`Unknown command: ${command}\n`)
    process.stdout.write(USAGE)
    process.exitCode = 1
}
