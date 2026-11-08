import type { DiceLogRow, Point, Quad } from '@trek12/vision'
import { useEffect, useRef, useState } from 'react'
import type { Dict } from '../../lib/i18n.ts'
import { type DiceEntry, type Die, TURNS } from '../../lib/reviewStore.ts'
import { cropBox, loadPhoto, type Photo, runVision } from '../../lib/vision.ts'
import type { Thumbs } from './DiceLog.tsx'
import { PhotoStage, ScanLayer, toImage, ZoomButtons } from './PhotoStage.tsx'

/** Below this confidence a die is ringed in orange for the player to check. */
export const DOUBT = 0.85

type Props = {
  file: File
  t: Dict
  onCancel: () => void
  onDone: (dice: DiceEntry[], doubts: { turn: number; die: Die }[], thumbs: Thumbs) => void
}

type Result = {
  dice: DiceEntry[]
  doubts: { turn: number; die: Die }[]
  thumbs: Thumbs
  read: number
}

function toResult(rows: DiceLogRow[], photo: Photo): Result {
  const dice: DiceEntry[] = Array.from({ length: TURNS }, () => ({ y: null, r: null }))
  const doubts: { turn: number; die: Die }[] = []
  const thumbs: Thumbs = new Map()
  let read = 0
  rows.forEach((row, i) => {
    // Ruled paper: a skipped line keeps its place (the roll stays empty).
    const turn = row.slot ?? i
    if (turn >= TURNS) return
    read++
    dice[turn] = { y: row.yellow.value, r: row.red.value }
    for (const [die, d] of [
      ['y', row.yellow],
      ['r', row.red],
    ] as const) {
      if (d.value === null || d.confidence < DOUBT) doubts.push({ turn, die })
      if (d.box) thumbs.set(`${turn}${die}`, cropBox(photo, d.box))
    }
  })
  return { dice, doubts, thumbs, read }
}

/**
 * Reads the handwritten dice log: frame the rolls (four corner handles, optional — the reader also
 * finds the columns on its own), read on the device, then check the values next to their crops.
 */
export function DiceScan({ file, t, onCancel, onDone }: Props) {
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [quad, setQuad] = useState<Quad | null>(null)
  const [zoom, setZoom] = useState(1)
  const [phase, setPhase] = useState<'frame' | 'reading' | 'result'>('frame')
  const [result, setResult] = useState<Result | null>(null)
  const drag = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    let url = ''
    loadPhoto(file)
      .then((p) => {
        url = p.url
        if (!alive) return
        setPhoto(p)
        const mx = p.width * 0.04
        const my = p.height * 0.04
        setQuad([
          { x: mx, y: my },
          { x: p.width - mx, y: my },
          { x: p.width - mx, y: p.height - my },
          { x: mx, y: p.height - my },
        ])
      })
      .catch(() => setError(t.photoError))
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [file, t])

  const read = async () => {
    if (!photo || !quad) return
    setPhase('reading')
    const s = photo.scale
    const res = await runVision({
      t: 'dice',
      image: photo.gray,
      quad: quad.map((p) => ({ x: p.x * s, y: p.y * s })) as Quad,
    })
    if (res.t !== 'dice') {
      setError(res.t === 'error' ? res.message : t.photoError)
      setPhase('frame')
      return
    }
    setResult(toResult(res.read.rows, photo))
    setPhase('result')
  }

  const handle = photo ? Math.max(photo.width, photo.height) * 0.022 : 10
  const svgOf = (el: Element) => el.closest('svg') as SVGSVGElement

  return (
    <ScanLayer title={t.scanDice}>
      {error && <p className="text-far">{error}</p>}
      {!photo && !error && <p className="text-muted">{t.reading}</p>}
      {photo && quad && phase !== 'result' && (
        <>
          <p className="text-sm text-muted">{t.scanFrame}</p>
          <ZoomButtons zoom={zoom} onZoom={setZoom} label={t.zoom} />
          <PhotoStage photo={photo} zoom={zoom} label={t.scanDice}>
            <polygon
              points={quad.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="rgba(242,183,5,0.12)"
              stroke="#f2b705"
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
            />
            {quad.map((p, i) => (
              <circle
                // biome-ignore lint/suspicious/noArrayIndexKey: the four corners are positional
                key={i}
                cx={p.x}
                cy={p.y}
                r={handle}
                fill="#f2b705"
                stroke="#14283a"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                style={{ touchAction: 'none', cursor: 'grab' }}
                onPointerDown={(e) => {
                  e.stopPropagation()
                  ;(e.target as Element).setPointerCapture(e.pointerId)
                  drag.current = i
                }}
                onPointerMove={(e) => {
                  if (drag.current !== i) return
                  const q: Point = toImage(svgOf(e.target as Element), photo, e.clientX, e.clientY)
                  const next = quad.slice() as Quad
                  next[i] = {
                    x: Math.min(photo.width, Math.max(0, q.x)),
                    y: Math.min(photo.height, Math.max(0, q.y)),
                  }
                  setQuad(next)
                }}
                onPointerUp={(e) => {
                  e.stopPropagation()
                  drag.current = null
                }}
              />
            ))}
          </PhotoStage>
          <p className="text-xs text-muted">{t.photoPrivacy}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={read}
              disabled={phase === 'reading'}
              className="flex-1 rounded-xl bg-accent px-4 py-3 font-bold text-accent-ink disabled:opacity-50"
            >
              {phase === 'reading' ? t.reading : t.readDice}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-line px-4 py-3"
            >
              {t.cancel}
            </button>
          </div>
        </>
      )}
      {photo && result && phase === 'result' && (
        <>
          <p className="font-medium" role="status">
            {result.read > 0 ? t.readResult(result.read, result.doubts.length) : t.noRead}
          </p>
          <ol className="grid grid-cols-2 gap-1.5">
            {result.dice.map((d, turn) => {
              if (d.y === null && d.r === null && !result.thumbs.has(`${turn}y`)) return null
              return (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: rolls are positional
                  key={turn}
                  className="flex items-center gap-1.5 rounded-lg border border-line bg-surface p-1.5"
                >
                  <span className="w-6 text-sm text-muted">{turn + 1}</span>
                  {(['y', 'r'] as Die[]).map((die) => {
                    const doubt = result.doubts.some((x) => x.turn === turn && x.die === die)
                    const v = die === 'y' ? d.y : d.r
                    return (
                      <span key={die} className="flex items-center gap-1">
                        {result.thumbs.has(`${turn}${die}`) && (
                          <img
                            src={result.thumbs.get(`${turn}${die}`)}
                            alt=""
                            className="h-9 w-9 rounded bg-white object-contain"
                          />
                        )}
                        <span
                          className={`grid size-7 place-items-center rounded-md font-bold ${
                            die === 'y' ? 'bg-accent text-accent-ink' : 'bg-die-red text-white'
                          } ${doubt ? 'ring-2 ring-mid ring-offset-1 ring-offset-surface' : ''}`}
                        >
                          {v ?? '?'}
                        </span>
                      </span>
                    )
                  })}
                </li>
              )
            })}
          </ol>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onDone(result.dice, result.doubts, result.thumbs)}
              disabled={result.read === 0}
              className="flex-1 rounded-xl bg-accent px-4 py-3 font-bold text-accent-ink disabled:opacity-40"
            >
              {t.apply}
            </button>
            <button
              type="button"
              onClick={() => setPhase('frame')}
              className="rounded-xl border border-line px-4 py-3"
            >
              {t.restart}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-line px-4 py-3"
            >
              {t.cancel}
            </button>
          </div>
        </>
      )}
    </ScanLayer>
  )
}
