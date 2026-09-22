import { ENGINE_VERSION } from '@trek12/engine'
import type { PingMessage, PongMessage } from './messages.ts'

self.onmessage = (event: MessageEvent<PingMessage>) => {
  if (event.data.t !== 'ping') return
  const reply: PongMessage = { t: 'pong', sent: event.data.sent, engineVersion: ENGINE_VERSION }
  self.postMessage(reply)
}
