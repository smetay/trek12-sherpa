import type { CellDef, CompiledMap } from '@trek12/engine'
import { applyH, homographyFrom, type Point, type SheetCellRead } from '@trek12/vision'
import { useEffect, useMemo, useState } from 'react'
import { cellLabel } from '../../lib/game.ts'
import type { Dict } from '../../lib/i18n.ts'
import { EMPTY_CELL } from '../../lib/reviewStore.ts'
import { cropCircle, loadPhoto, type Photo, runVision } from '../../lib/vision.ts'
import { MapSvg, wash } from '../MapSvg.tsx'
import { PhotoStage, ScanLayer, ZoomButtons } from './PhotoStage.tsx'

/** Below this confidence a circle is marked for the player to check. */
export const SHEET_DOUBT = 0.8

/**
 * Four circles far apart (leftmost, rightmost, topmost, bottommost, then the farthest from those
 * already chosen): the taps that pin the photo to the map best.
 */
export function anchorCells(cells: CellDef[]): number[] {
  const by = (f: (c: CellDef) => number) => cells.reduce((b, c) => (f(c) < f(b) ? c : b)).id
  const chosen: number[] = []
  for (const id of [by((c) => c.x), by((c) => -c.y), by((c) => -c.x), by((c) => c.y)]) {
    if (!chosen.includes(id)) chosen.push(id)
  }
  while (chosen.length < 4) {
    let best = -1
    let bestD = -1
    for (const c of cells) {
      if (chosen.includes(c.id)) continue
      const d = Math.min(...chosen.map((k) => Math.hypot(c.x - cells[k].x, c.y - cells[k].y)))
      if (d > bestD) {
        bestD = d
        best = c.id
      }
    }
    chosen.push(best)
  }
  return chosen
}

type Props = {
  file: File
  map: CompiledMap
  t: Dict
  onCancel: () => void
  onDone: (values: number[], doubts: number[], crops: Map<number, string>) => void
}

/**
 * Reads a filled ascent sheet: the player taps four indicated circles on the photo (the app knows
 * the layout of every sheet, so four points fix the perspective), checks that the projected circles
 * sit on the printed ones, and the numbers are read on the device.
 */
export function SheetScan({ file, map, t, onCancel, onDone }: Props) {
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [taps, setTaps] = useState<Point[]>([])
  const [zoom, setZoom] = useState(1)
  const [phase, setPhase] = useState<'align' | 'reading' | 'result'>('align')
  const [reads, setReads] = useState<SheetCellRead[] | null>(null)
  const anchors = useMemo(() => anchorCells(map.def.cells), [map])

  useEffect(() => {
    let alive = true
    let url = ''
    loadPhoto(file)
      .then((p) => {
        url = p.url
        if (alive) setPhoto(p)
      })
      .catch(() => setError(t.photoError))
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [file, t])

  // Projected circles once the four anchors are placed (natural pixels).
  const projected = useMemo(() => {
    if (taps.length < 4) return null
    const H = homographyFrom(
      anchors.map((id) => ({ x: map.def.cells[id].x, y: map.def.cells[id].y })),
      taps,
    )
    return map.def.cells.map((c) => {
      const center = applyH(H, { x: c.x, y: c.y })
      const edge = applyH(H, { x: c.x + 0.5, y: c.y })
      return { center, r: Math.hypot(edge.x - center.x, edge.y - center.y) }
    })
  }, [taps, anchors, map])

  const read = async () => {
    if (!photo || taps.length < 4) return
    setPhase('reading')
    const s = photo.scale
    const res = await runVision({
      t: 'sheet',
      image: photo.gray,
      cells: map.def.cells.map((c) => ({ x: c.x, y: c.y, max: c.max })),
      anchors: anchors.map((cell, i) => ({ cell, at: { x: taps[i].x * s, y: taps[i].y * s } })),
    })
    if (res.t !== 'sheet') {
      setError(res.t === 'error' ? res.message : t.photoError)
      setPhase('align')
      return
    }
    setReads(res.cells)
    setPhase('result')
  }

  const doubtful = (r: SheetCellRead) => r.confidence < SHEET_DOUBT
  const finish = () => {
    if (!reads || !photo) return
    const values = reads.map((r) => r.value ?? EMPTY_CELL)
    const doubts = reads.flatMap((r, c) => (doubtful(r) ? [c] : []))
    const crops = new Map<number, string>()
    reads.forEach((r, c) => {
      crops.set(c, cropCircle(photo, r.center, r.radius))
    })
    onDone(values, doubts, crops)
  }

  const next = taps.length < 4 ? anchors[taps.length] : null
  const mark = photo ? Math.max(photo.width, photo.height) * 0.018 : 8

  return (
    <ScanLayer title={t.scanSheet}>
      {error && <p className="text-far">{error}</p>}
      {!photo && !error && <p className="text-muted">{t.reading}</p>}
      {photo && phase !== 'result' && (
        <>
          <div className="flex items-start gap-3">
            <MapSvg
              map={map.def}
              className="w-28 shrink-0 rounded-lg border border-line bg-surface"
              cells={(id) => {
                const k = anchors.indexOf(id)
                if (k < 0) return {}
                const done = k < taps.length
                return {
                  label: done ? '✓' : String(k + 1),
                  fill: id === next ? 'var(--accent)' : done ? wash('var(--heat-best)') : undefined,
                  ring: id === next,
                }
              }}
            />
            <div className="flex flex-col gap-1 text-sm">
              <p className="font-medium">
                {taps.length < 4 ? t.alignStep(taps.length + 1) : t.alignCheck}
              </p>
              <p className="text-muted">{t.alignHint}</p>
            </div>
          </div>
          <ZoomButtons zoom={zoom} onZoom={setZoom} label={t.zoom} />
          <PhotoStage
            photo={photo}
            zoom={zoom}
            label={t.scanSheet}
            onTap={(p) => {
              if (taps.length < 4) setTaps([...taps, p])
            }}
          >
            {projected?.map((c, id) => (
              <circle
                // biome-ignore lint/suspicious/noArrayIndexKey: one circle per map cell
                key={id}
                cx={c.center.x}
                cy={c.center.y}
                r={c.r}
                fill="none"
                stroke="#1e88e5"
                strokeWidth={2.5}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ))}
            {taps.map((p, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: taps are positional
              <g key={i} pointerEvents="none">
                {/* A ring with a centre dot: the handwriting under the tap stays visible. */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={mark * 1.6}
                  fill="none"
                  stroke="#f2b705"
                  strokeWidth={3}
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={p.x} cy={p.y} r={mark * 0.18} fill="#f2b705" />
                <text
                  x={p.x + mark * 1.6}
                  y={p.y - mark * 1.6}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={mark * 1.4}
                  fontWeight={700}
                  fill="#14283a"
                  stroke="#f2b705"
                  strokeWidth={mark * 0.35}
                  paintOrder="stroke"
                >
                  {i + 1}
                </text>
              </g>
            ))}
          </PhotoStage>
          <p className="text-xs text-muted">{t.photoPrivacy}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={read}
              disabled={taps.length < 4 || phase === 'reading'}
              className="flex-1 rounded-xl bg-accent px-4 py-3 font-bold text-accent-ink disabled:opacity-40"
            >
              {phase === 'reading' ? t.reading : t.readNumbers}
            </button>
            <button
              type="button"
              onClick={() => setTaps(taps.slice(0, -1))}
              disabled={taps.length === 0}
              className="rounded-xl border border-line px-3 py-3 text-sm disabled:opacity-40"
            >
              {t.undoPoint}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-line px-3 py-3 text-sm"
            >
              {t.cancel}
            </button>
          </div>
        </>
      )}
      {photo && reads && phase === 'result' && (
        <>
          <p className="font-medium" role="status">
            {t.sheetRead(
              reads.filter((r) => r.value !== null).length,
              reads.filter(doubtful).length,
            )}
          </p>
          <MapSvg
            map={map.def}
            className="w-full rounded-2xl border border-line bg-surface"
            cells={(id) => {
              const r = reads[id]
              const doubt = doubtful(r)
              return {
                label: r.value === null ? '' : cellLabel(r.value),
                stroke: doubt ? 'var(--heat-mid)' : undefined,
                fill: doubt ? wash('var(--heat-mid)') : undefined,
                dashed: doubt,
              }
            }}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={finish}
              className="flex-1 rounded-xl bg-accent px-4 py-3 font-bold text-accent-ink"
            >
              {t.apply}
            </button>
            <button
              type="button"
              onClick={() => {
                setTaps([])
                setPhase('align')
              }}
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
