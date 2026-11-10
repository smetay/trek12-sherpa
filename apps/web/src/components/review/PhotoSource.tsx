import { type DragEvent, useRef, useState } from 'react'
import type { Dict } from '../../lib/i18n.ts'

/** The first image file of a drop or a paste, if any. */
export function imageFrom(data: DataTransfer | null): File | null {
  if (!data) return null
  for (const file of Array.from(data.files)) if (file.type.startsWith('image/')) return file
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) return file
    }
  }
  return null
}

const button =
  'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface px-2 py-2 text-center text-sm font-semibold leading-tight'

/**
 * Where a photo comes from: the camera (the `capture` attribute opens it directly on phones) or the
 * gallery and files (no `capture`, so the system picker offers photos already taken). Both inputs
 * stay in the DOM, hidden, and are opened by real buttons.
 */
export function PhotoSource({
  subject,
  onFile,
  t,
}: {
  /** What is being scanned ("Scanner les dés"), announced as the group's name. */
  subject: string
  onFile: (file: File) => void
  t: Dict
}) {
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const take = (e: { target: HTMLInputElement }) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) onFile(file)
  }
  return (
    <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
      <legend className="sr-only">{subject}</legend>
      <div className="flex gap-2">
        <button type="button" onClick={() => camera.current?.click()} className={button}>
          <span aria-hidden="true">📷</span> {t.takePhoto}
        </button>
        <button type="button" onClick={() => gallery.current?.click()} className={button}>
          <span aria-hidden="true">🖼️</span> {t.importPhoto}
        </button>
      </div>
      <p className="hidden text-xs text-muted [@media(hover:hover)_and_(pointer:fine)]:block">
        {t.dropHint}
      </p>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label={`${subject} : ${t.takePhoto}`}
        data-source="camera"
        onChange={take}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label={`${subject} : ${t.importPhoto}`}
        data-source="gallery"
        onChange={take}
      />
    </fieldset>
  )
}

/**
 * Lets a section of the page receive an image dropped from the computer. Returns the handlers to
 * spread on the section and whether a drag is over it (for highlighting). Children firing their own
 * enter/leave events are counted so the highlight does not flicker.
 */
export function useImageDrop(onFile: (file: File) => void) {
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
  return {
    over,
    handlers: {
      onDragEnter: (e: DragEvent) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        depth.current++
        setOver(true)
      },
      onDragOver: (e: DragEvent) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      },
      onDragLeave: () => {
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setOver(false)
      },
      onDrop: (e: DragEvent) => {
        const file = imageFrom(e.dataTransfer)
        depth.current = 0
        setOver(false)
        if (!file) return
        e.preventDefault()
        onFile(file)
      },
    },
  }
}

/** Ring drawn around a section while an image is dragged over it. */
export const DROP_RING = 'rounded-2xl outline-2 outline-offset-4 outline-dashed outline-accent'
