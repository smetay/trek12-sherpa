import { createHandler, type SolverRequest } from '@trek12/solver'

// One solver worker: receives `init` then `rollouts` requests, answers with typed-array scores.
const handle = createHandler()

self.onmessage = (event: MessageEvent<SolverRequest>) => {
  const res = handle(event.data)
  if (res.t === 'rollouts') self.postMessage(res, [res.scores.buffer])
  else self.postMessage(res)
}
