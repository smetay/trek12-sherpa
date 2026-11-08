import type { Point } from '@trek12/vision'
import { type ReactNode, useRef } from 'react'
import type { Photo } from '../../lib/vision.ts'

type Props = {
  photo: Photo
  /** 1 = fit the width; larger values scroll (native pinch-free zoom that works everywhere). */
  zoom: number
  /** SVG overlay in natural image pixels. */
  children?: ReactNode
  /** A tap (not a scroll) on the photo, in natural image pixels. */
  onTap?: (p: Point) => void
  label: string
}

/** Maps a pointer position to natural image pixels. */
export function toImage(svg: SVGSVGElement, photo: Photo, clientX: number, clientY: number): Point {
  const rect = svg.getBoundingClientRect()
  return {
    x: ((clientX - rect.left) / rect.width) * photo.width,
    y: ((clientY - rect.top) / rect.height) * photo.height,
  }
}

/**
 * A photo with an SVG overlay in its own pixel coordinates. Zooming widens the photo inside a
 * scrolling frame, so one finger scrolls and a short tap places a point.
 */
export function PhotoStage({ photo, zoom, children, onTap, label }: Props) {
  const svg = useRef<SVGSVGElement>(null)
  const down = useRef<{ x: number; y: number; t: number } | null>(null)
  return (
    <div className="max-h-[62dvh] overflow-auto rounded-xl border border-line bg-black/5">
      <div className="relative" style={{ width: `${zoom * 100}%` }}>
        <img src={photo.url} alt={label} className="block w-full select-none" draggable={false} />
        <svg
          ref={svg}
          viewBox={`0 0 ${photo.width} ${photo.height}`}
          className="absolute inset-0 size-full"
          role="img"
          aria-label={label}
          onPointerDown={(e) => {
            down.current = { x: e.clientX, y: e.clientY, t: e.timeStamp }
          }}
          onPointerUp={(e) => {
            const d = down.current
            down.current = null
            if (!d || !onTap || !svg.current) return
            const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y)
            if (moved < 10 && e.timeStamp - d.t < 700) {
              onTap(toImage(svg.current, photo, e.clientX, e.clientY))
            }
          }}
        >
          {children}
        </svg>
      </div>
    </div>
  )
}

export function ZoomButtons({
  zoom,
  onZoom,
  label,
}: {
  zoom: number
  onZoom: (z: number) => void
  label: string
}) {
  return (
    <fieldset className="m-0 flex items-center gap-1.5 border-0 p-0 text-sm">
      <legend className="sr-only">{label}</legend>
      <span className="text-muted" aria-hidden="true">
        {label}
      </span>
      {[1, 2, 3].map((z) => (
        <button
          key={z}
          type="button"
          onClick={() => onZoom(z)}
          aria-pressed={zoom === z}
          className={`h-8 min-w-10 rounded-lg border px-2 font-semibold ${
            zoom === z ? 'border-ink bg-ink text-bg' : 'border-line bg-surface'
          }`}
        >
          ×{z}
        </button>
      ))}
    </fieldset>
  )
}

/** Full-screen layer used by the two scanners. */
export function ScanLayer({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-40 overflow-y-auto bg-bg"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 px-4 pt-3 pb-8">
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  )
}
