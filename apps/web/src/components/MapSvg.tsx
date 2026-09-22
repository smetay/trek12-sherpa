import type { MapDef } from '@trek12/engine'
import { useMemo } from 'react'

const R = 0.5 // circle radius in map units (neighbouring centres are ~1 apart)
const PAD = 0.75

export type CellVisual = {
  fill?: string
  stroke?: string
  label?: string
  dim?: boolean
}

type Props = {
  map: MapDef
  cells?: (id: number) => CellVisual
  edges?: boolean
  highlightEdges?: [number, number][]
  onCellClick?: (id: number) => void
  className?: string
}

/** Neutral rendering of a sheet: circles, thick double outline for dangerous ones, optional edges. */
export function MapSvg({
  map,
  cells,
  edges = false,
  highlightEdges = [],
  onCellClick,
  className,
}: Props) {
  const box = useMemo(() => {
    const xs = map.cells.map((c) => c.x)
    const ys = map.cells.map((c) => c.y)
    const minX = Math.min(...xs) - PAD
    const minY = Math.min(...ys) - PAD
    return { minX, minY, w: Math.max(...xs) + PAD - minX, h: Math.max(...ys) + PAD - minY }
  }, [map])

  const highlighted = new Set(highlightEdges.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)))

  return (
    <svg
      viewBox={`${box.minX} ${box.minY} ${box.w} ${box.h}`}
      className={className}
      role="img"
      aria-label={map.name}
    >
      <title>{map.name}</title>
      {(edges || highlightEdges.length > 0) &&
        map.edges.map(([a, b]) => {
          const key = a < b ? `${a}-${b}` : `${b}-${a}`
          const on = highlighted.has(key)
          if (!edges && !on) return null
          return (
            <line
              key={key}
              x1={map.cells[a].x}
              y1={map.cells[a].y}
              x2={map.cells[b].x}
              y2={map.cells[b].y}
              stroke={on ? '#f59e0b' : '#334155'}
              strokeWidth={on ? 0.09 : 0.04}
              strokeLinecap="round"
            />
          )
        })}
      {map.cells.map((cell) => {
        const v = cells?.(cell.id) ?? {}
        const dangerous = cell.max < 12
        const stroke = v.stroke ?? (dangerous ? '#f8fafc' : '#94a3b8')
        const shape = (
          <>
            <circle
              cx={cell.x}
              cy={cell.y}
              r={R}
              fill={v.fill ?? '#1e293b'}
              stroke={stroke}
              strokeWidth={0.05}
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
            <text
              x={cell.x}
              y={cell.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={v.label !== undefined ? 0.42 : 0.3}
              fontWeight={600}
              fill={v.label !== undefined ? '#f8fafc' : '#64748b'}
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >
              {v.label ?? cell.id}
            </text>
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
