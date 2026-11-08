import type { Box, GrayImage, Point } from '@trek12/vision'
import type { VisionRequest, VisionResponse } from '../worker/messages.ts'
import VisionWorker from '../worker/vision.worker.ts?worker'

/** Longest side of the grayscale copy handed to the reader (enough for handwriting, fast). */
const WORK_SIDE = 1600

/**
 * A photo ready to be read: its natural size (orientation applied), an object URL to display it,
 * a downscaled grayscale copy for the reader and a colour canvas of the same size for thumbnails.
 * `scale` converts natural pixels to work pixels.
 */
export type Photo = {
  url: string
  width: number
  height: number
  scale: number
  gray: GrayImage
  canvas: HTMLCanvasElement
}

export async function loadPhoto(file: Blob): Promise<Photo> {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.src = url
  // <img> applies the EXIF orientation, so the pixels match what the user sees.
  await img.decode()
  const width = img.naturalWidth
  const height = img.naturalHeight
  const scale = Math.min(1, WORK_SIDE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas unavailable')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const data = new Uint8Array(canvas.width * canvas.height)
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    data[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8
  }
  return {
    url,
    width,
    height,
    scale,
    gray: { width: canvas.width, height: canvas.height, data },
    canvas,
  }
}

/** A small JPEG of a region of the work image (box in work pixels), with some margin. */
export function cropBox(photo: Photo, box: Box, margin = 0.35, size = 96): string {
  const mx = box.w * margin
  const my = box.h * margin
  const side = Math.max(box.w + 2 * mx, box.h + 2 * my)
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  return crop(photo, cx - side / 2, cy - side / 2, side, side, size)
}

/** A round thumbnail source of a circle (centre and radius in work pixels). */
export function cropCircle(photo: Photo, center: Point, radius: number, size = 96): string {
  const side = radius * 2.2
  return crop(photo, center.x - side / 2, center.y - side / 2, side, side, size)
}

function crop(photo: Photo, x: number, y: number, w: number, h: number, size: number): string {
  const out = document.createElement('canvas')
  out.width = size
  out.height = Math.max(1, Math.round((size * h) / w))
  const ctx = out.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(photo.canvas, x, y, w, h, 0, 0, out.width, out.height)
  return out.toDataURL('image/jpeg', 0.8)
}

/** Runs one reading in a dedicated worker (terminated afterwards: readings are rare). */
export function runVision(req: VisionRequest): Promise<VisionResponse> {
  return new Promise((resolve) => {
    const worker = new VisionWorker()
    worker.onmessage = (event: MessageEvent<VisionResponse>) => {
      worker.terminate()
      resolve(event.data)
    }
    worker.onerror = (event) => {
      worker.terminate()
      resolve({ t: 'error', message: event.message })
    }
    worker.postMessage(req)
  })
}
