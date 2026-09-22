import type { MapDef } from '@trek12/engine'
import { useMemo } from 'react'

const R = 0.5 // circle radius in map units (neighbouring centres are ~1 apart)
const PAD = 0.7

export type CellVisual = {
  fill?: string
  stroke?: string
  label?: string
  dim?: boolean
  dashed?: boolean
  labelColor?: string
}

type Props = {
  map: MapDef
  cells?: (id: number) => CellVisual
  /** Draw every adjacency (verification view). */
  edges?: boolean
  /** Rope links drawn on the sheet. */
  links?: [number, number][]
  /** Highlighted edges (amber, dashed): neighbours of the selected cell, or a previewed link. */
  highlightEdges?: [number, number][]
  onCellClick?: (id: number) => void
  className?: string
  /** Show the cell ids in empty circles (verification view). */
  showIds?: boolean
}

/** Neutral rendering of a sheet: circles, thick double outline for dangerous ones, links, previews. */
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

  const line = (a: number, b: number, stroke: string, width: number, dashed = false) => (
    <line
      key={`${a}-${b}-${stroke}`}
      x1={map.cells[a].x}
      y1={map.cells[a].y}
      x2={map.cells[b].x}
      y2={map.cells[b].y}
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={dashed ? '0.08 0.08' : undefined}
    />
  )

  return (
    <svg
      viewBox={`${box.minX} ${box.minY} ${box.w} ${box.h}`}
      className={className}
      role="img"
      aria-label={map.name}
    >
      <title>{map.name}</title>
      {edges && map.edges.map(([a, b]) => line(a, b, '#334155', 0.04))}
      {links.map(([a, b]) => line(a, b, '#f59e0b', 0.12))}
      {highlightEdges.map(([a, b]) => line(a, b, '#fbbf24', 0.09, true))}
      {map.cells.map((cell) => {
        const v = cells?.(cell.id) ?? {}
        const dangerous = cell.max < 12
        const stroke = v.stroke ?? (dangerous ? '#f8fafc' : '#94a3b8')
        const label = v.label ?? (showIds ? String(cell.id) : '')
        const shape = (
          <>
            <circle
              cx={cell.x}
              cy={cell.y}
              r={R}
              fill={v.fill ?? '#1e293b'}
              stroke={stroke}
              strokeWidth={0.05}
              strokeDasharray={v.dashed ? '0.1 0.06' : undefined}
            />
            {dangerous && (
              <circle
                cx={cell.x}
                cy={cell.y}
                r={R - 0.1}
                fill="none"
                stroke={stroke}
                strokeWidth={0.05}
              />
            )}
            {label !== '' && (
              <text
                x={cell.x}
                y={cell.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={label.length > 1 ? 0.42 : 0.48}
                fontWeight={700}
                fill={v.labelColor ?? (v.label !== undefined ? '#f8fafc' : '#64748b')}
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >
                {label}
              </text>
            )}
          </>
        )
        const opacity = v.dim ? 0.35 : 1
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
            aria-label={`Case ${cell.id}${dangerous ? ' (dangereuse)' : ''}`}
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
    </svg>
  )
}
