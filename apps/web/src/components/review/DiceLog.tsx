import { useState } from 'react'
import type { Dict } from '../../lib/i18n.ts'
import { type DiceEntry, type Die, parseDiceText, TURNS } from '../../lib/reviewStore.ts'
import { DiceInput } from '../DiceInput.tsx'

/** Photo crops of the dice read by the scanner, keyed `${turn}${die}` (data URLs). */
export type Thumbs = Map<string, string>

function Face({ value, tone, doubt }: { value: number | null; tone: Die; doubt: boolean }) {
  const filled =
    tone === 'y'
      ? 'bg-accent text-accent-ink border-accent'
      : 'bg-die-red text-white border-die-red'
  return (
    <span
      className={`grid size-6 place-items-center rounded-md border-2 text-sm font-bold leading-none min-[380px]:size-7 min-[380px]:text-base ${
        value === null ? 'border-dashed border-line text-muted' : filled
      } ${doubt ? 'ring-2 ring-mid ring-offset-1 ring-offset-surface' : ''}`}
    >
      {value ?? ''}
    </span>
  )
}

type Props = {
  dice: DiceEntry[]
  doubts: { turn: number; die: Die }[]
  thumbs: Thumbs
  onDie: (turn: number, die: Die, value: number | null) => void
  onText: (dice: DiceEntry[]) => void
  t: Dict
}

/**
 * The 19 rolls as a compact grid of die pairs (fits a phone screen without scrolling), with a docked
 * keypad for the selected roll that jumps to the next missing roll as soon as both dice are set.
 * Rolls read from a photo with low confidence are ringed in orange until confirmed or corrected.
 */
export function DiceLog({ dice, doubts, thumbs, onDie, onText, t }: Props) {
  const [active, setActive] = useState<number | null>(null)
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const [textError, setTextError] = useState(false)
  const isDoubt = (turn: number, die: Die) => doubts.some((d) => d.turn === turn && d.die === die)
  const filled = dice.filter((d) => d.y !== null && d.r !== null).length

  const set = (turn: number, y: number | null, r: number | null) => {
    const before = dice[turn]
    const yTap = y !== before.y
    const rTap = r !== before.r
    // Re-tapping the value already there confirms it (clears an orange "to check" mark).
    if (yTap || !rTap) onDie(turn, 'y', y)
    if (rTap || !yTap) onDie(turn, 'r', r)
    if (y === null || r === null || (before.y !== null && before.r !== null)) return
    // Roll just completed: jump to the next roll still missing, or close the keypad at the end.
    let next: number | null = null
    for (let k = 1; k < TURNS && next === null; k++) {
      const x = (turn + k) % TURNS
      if (dice[x].y === null || dice[x].r === null) next = x
    }
    setActive(next)
  }

  const applyText = () => {
    const parsed = parseDiceText(text)
    if (!parsed) {
      setTextError(true)
      return
    }
    onText(parsed)
    setTyping(false)
    setText('')
    setTextError(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <ol className="grid grid-cols-5 gap-1 min-[380px]:gap-1.5" aria-label={t.rolls}>
        {dice.map((d, turn) => {
          const doubt = isDoubt(turn, 'y') || isDoubt(turn, 'r')
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: the 19 rolls are positional
            <li key={turn}>
              <button
                type="button"
                onClick={() => setActive(active === turn ? null : turn)}
                aria-pressed={active === turn}
                aria-label={`${t.rollN(turn + 1)} : ${d.y ?? '?'} / ${d.r ?? '?'}${doubt ? `, ${t.toCheck}` : ''}`}
                className={`flex w-full flex-col items-center gap-0.5 rounded-lg border px-0.5 pt-0.5 pb-1 ${
                  active === turn
                    ? 'border-ink bg-surface ring-2 ring-ink'
                    : 'border-line bg-surface'
                }`}
              >
                <span className="text-[11px] leading-none text-muted">{turn + 1}</span>
                <span className="flex gap-0.5">
                  <Face value={d.y} tone="y" doubt={isDoubt(turn, 'y')} />
                  <Face value={d.r} tone="r" doubt={isDoubt(turn, 'r')} />
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <div className="flex items-center justify-between gap-2 text-sm text-muted">
        <span>{filled < TURNS ? t.tapRoll : ''}</span>
        <button
          type="button"
          onClick={() => setTyping((v) => !v)}
          className="shrink-0 underline underline-offset-2"
          aria-expanded={typing}
        >
          {t.typeDice}
        </button>
      </div>
      {typing && (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
          <label className="text-sm text-muted" htmlFor="dice-text">
            {t.typeHint}
          </label>
          <textarea
            id="dice-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setTextError(false)
            }}
            inputMode="numeric"
            rows={2}
            className="rounded-lg border border-line bg-bg p-2 font-mono text-base"
          />
          {textError && <p className="text-sm text-far">{t.invalidDice}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={applyText}
              disabled={text.trim() === ''}
              className="flex-1 rounded-lg bg-accent px-3 py-2 font-semibold text-accent-ink disabled:opacity-40"
            >
              {t.apply}
            </button>
            <button
              type="button"
              onClick={() => setTyping(false)}
              className="rounded-lg border border-line px-3 py-2"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {active !== null && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/97 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] shadow-lg backdrop-blur">
          <div className="mx-auto flex max-w-md flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{t.rollN(active + 1)}</p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setActive(Math.max(0, active - 1))}
                  disabled={active === 0}
                  className="h-9 rounded-lg border border-line px-3 text-sm disabled:opacity-35"
                  aria-label={t.previous}
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => setActive(active + 1 < TURNS ? active + 1 : null)}
                  className="h-9 rounded-lg border border-line px-3 text-sm"
                  aria-label={t.next}
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className="h-9 rounded-lg bg-ink px-3 text-sm font-semibold text-bg"
                >
                  {t.done}
                </button>
              </div>
            </div>
            {(thumbs.has(`${active}y`) || thumbs.has(`${active}r`)) && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <span>{t.readOnPhoto}</span>
                {(['y', 'r'] as Die[]).map((die) =>
                  thumbs.has(`${active}${die}`) ? (
                    <img
                      key={die}
                      src={thumbs.get(`${active}${die}`)}
                      alt=""
                      className={`h-12 rounded border-2 bg-white ${die === 'y' ? 'border-accent' : 'border-die-red'}`}
                    />
                  ) : null,
                )}
              </div>
            )}
            <DiceInput
              y={dice[active].y}
              r={dice[active].r}
              onChange={(y, r) => set(active, y, r)}
              labels={{ yellow: t.yellowDie, red: t.redDie }}
            />
            <button
              type="button"
              onClick={() => {
                onDie(active, 'y', null)
                onDie(active, 'r', null)
              }}
              className="self-start text-sm text-muted underline underline-offset-2"
            >
              {t.clearRoll}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
