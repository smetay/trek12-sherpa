import { readDiceLog, readSheet } from '@trek12/vision'
import type { VisionRequest, VisionResponse } from './messages.ts'

// Reads photographed paper off the main thread: one request, one answer.
self.onmessage = (event: MessageEvent<VisionRequest>) => {
  const req = event.data
  let res: VisionResponse
  try {
    res =
      req.t === 'dice'
        ? { t: 'dice', read: readDiceLog(req.image, req.quad) }
        : { t: 'sheet', cells: readSheet(req.image, req.cells, req.anchors) }
  } catch (error) {
    res = { t: 'error', message: String(error) }
  }
  self.postMessage(res)
}
