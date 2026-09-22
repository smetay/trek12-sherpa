import * as fc from 'fast-check'

// Property-based tests are cheap and deterministic in CI (FC_RUNS=100, fixed seed) and can be
// cranked up locally / nightly: FC_RUNS=5000 FC_SEED=$RANDOM pnpm test
const numRuns = Number(process.env.FC_RUNS ?? 100)
const seed = process.env.FC_SEED === undefined ? 20260921 : Number(process.env.FC_SEED)

fc.configureGlobal({ numRuns, seed })
