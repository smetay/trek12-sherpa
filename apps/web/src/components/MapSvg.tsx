import type { MapDef } from '@trek12/engine'
import { useMemo } from 'react'

const R = 0.5 // circle radius in map units (neighbouring centres are ~1 apart)
const PAD = 0.62

export type CellVisual = {
  /** Any CSS colour; see `wash()` for heat tints. */
  fill?: string
  stroke?: string
  /** Selection ring drawn outside the circle. */
  ring?: boolean
  /** Main text (the number written, or the number the move would write). */
  label?: string
  /** Second, smaller line under the label (heat indicator). */
  sub?: string
  subColor?: string
  /** Small ★ badge (best circle). */
  star?: boolean
  dim?: boolean
  dashed?: boolean
  /** Screen-reader description (defaults to "Case n"). */
  ariaLabel?: string
}

/** A light tint of `color` over the empty-circle colour, readable in both themes. */
export function wash(color: string): string {
  return `color-mix(in srgb, ${color} var(--heat-wash), var(--cell))`
}

type Props = {
  map: MapDef
  cells?: (id: number) => CellVisual
  /** Draw every adjacency (verification view). */
  edges?: boolean
  /** Rope links drawn on the sheet. */
  links?: [number, number][]
  /** Previewed links (dashed): the links the selected move would draw. */
  highlightEdges?: [number, number][]
  onCellClick?: (id: number) => void
  className?: string
  /** Show the cell ids in empty circles (verification view). */
  showIds?: boolean
}

/** Neutral rendering of a sheet: circles, thick double outline for dangerous ones, links, heat. */
export function MapSvg({
  map,
  cells,
  edges = false,
  links = [],
  highlightEdges = [],
  onCellClick,
  className,
  showIds = false,
}: Props) {
  const box = useMemo(() => {
    const xs = map.cells.map((c) => c.x)
    const ys = map.cells.map((c) => c.y)
    const minX = Math.min(...xs) - PAD
    const minY = Math.min(...ys) - PAD
    return { minX, minY, w: Math.max(...xs) + PAD - minX, h: Math.max(...ys) + PAD - minY }
  }, [map])

  /** Segment between two cells, trimmed to [from, 1 − from] of the centre-to-centre distance. */
  const line = (a: number, b: number, stroke: string, width: number, dashed = false, from = 0) => {
    const A = map.cells[a]
    const B = map.cells[b]
    const dx = B.x - A.x
    const dy = B.y - A.y
    return (
      <line
        key={`${a}-${b}-${dashed ? 'p' : 'l'}`}
        x1={A.x + dx * from}
        y1={A.y + dy * from}
        x2={B.x - dx * from}
        y2={B.y - dy * from}
        style={{ stroke }}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={dashed ? '0.07 0.06' : undefined}
      />
    )
  }

  const visuals = map.cells.map((c) => cells?.(c.id) ?? {})

  return (
    <svg
      viewBox={`${box.minX} ${box.minY} ${box.w} ${box.h}`}
      className={className}
      role="img"
      aria-label={map.name}
    >
      <title>{map.name}</title>
      {edges && map.edges.map(([a, b]) => line(a, b, 'var(--line)', 0.04))}
      {map.cells.map((cell) => {
        const v = visuals[cell.id]
        const dangerous = cell.max < 12
        const stroke = v.stroke ?? (dangerous ? 'var(--cell-strong)' : 'var(--cell-stroke)')
        const label = v.label ?? (showIds ? String(cell.id) : '')
        const withSub = v.sub !== undefined && v.sub !== ''
        const shape = (
          <>
            <circle
              cx={cell.x}
              cy={cell.y}
              r={R}
              style={{ fill: v.fill ?? 'var(--cell)', stroke }}
              strokeWidth={dangerous ? 0.07 : 0.045}
              strokeDasharray={v.dashed ? '0.1 0.06' : undefined}
            />
            {dangerous && (
              <circle
                cx={cell.x}
                cy={cell.y}
                r={R - 0.11}
                fill="none"
                style={{ stroke }}
                strokeWidth={0.045}
              />
            )}
            {label !== '' && (
              <text
                x={cell.x}
                y={withSub ? cell.y - 0.09 : cell.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={withSub ? 0.36 : label.length > 1 ? 0.42 : 0.48}
                fontWeight={700}
                style={{
                  fill: v.label !== undefined ? 'var(--ink)' : 'var(--muted)',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              >
                {label}
              </text>
            )}
            {withSub && (
              <text
                x={cell.x}
                y={cell.y + 0.23}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={0.22}
                fontWeight={700}
                style={{
                  fill: v.subColor ?? 'var(--ink)',
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              >
                {v.sub}
              </text>
            )}
          </>
        )
        const opacity = v.dim ? 0.4 : 1
        if (!onCellClick) {
          return (
            <g key={cell.id} opacity={opacity}>
              {shape}
            </g>
          )
        }
        return (
          // biome-ignore lint/a11y/useSemanticElements: no <button> inside SVG; the group carries the role
          <g
            key={cell.id}
            role="button"
            tabIndex={0}
            aria-label={v.ariaLabel ?? `Case ${cell.id}${dangerous ? ' (dangereuse)' : ''}`}
            onClick={() => onCellClick(cell.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onCellClick(cell.id)
              }
            }}
            className="cursor-pointer"
            opacity={opacity}
          >
            {shape}
          </g>
        )
      })}
      {/* Rope links are drawn over the circles' junction, like a pencil stroke on the sheet. */}
      {links.map(([a, b]) => line(a, b, 'var(--rope)', 0.1, false, 0.3))}
      {highlightEdges.map(([a, b]) => line(a, b, 'var(--rope)', 0.09, true, 0.3))}
      {/* Overlays that spill onto neighbouring circles go last so nothing covers them. */}
      {map.cells.map((cell) =>
        visuals[cell.id].ring ? (
          <circle
            key={`ring-${cell.id}`}
            cx={cell.x}
            cy={cell.y}
            r={R + 0.08}
            fill="none"
            style={{ stroke: 'var(--ink)', pointerEvents: 'none' }}
            strokeWidth={0.07}
          />
        ) : null,
      )}
      {map.cells.map((cell) =>
        visuals[cell.id].star ? (
          <g key={`star-${cell.id}`} style={{ pointerEvents: 'none' }}>
            <circle
              cx={cell.x + 0.36}
              cy={cell.y - 0.36}
              r={0.17}
              style={{ fill: 'var(--heat-best)', stroke: 'var(--surface)' }}
              strokeWidth={0.04}
            />
            <text
              x={cell.x + 0.36}
              y={cell.y - 0.35}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={0.22}
              style={{ fill: '#ffffff', userSelect: 'none' }}
            >
              ★
            </text>
          </g>
        ) : null,
      )}
    </svg>
  )
}
