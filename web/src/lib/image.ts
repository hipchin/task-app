// 画像の縮小と再エンコード（SPEC §3.3）：長辺2048px、JPEG品質0.8

export const MAX_EDGE = 2048
export const JPEG_QUALITY = 0.8

export interface ResizedImage {
  blob: Blob
  width: number
  height: number
}

export function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h }
  const scale = max / Math.max(w, h)
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

export async function resizeImage(file: Blob): Promise<ResizedImage> {
  // TODO-5: iPhone の HEIC がブラウザで JPEG に変換されるか実機で確認する。
  // Safari は <input type="file"> で HEIC を JPEG に変換して渡すことが多いが、
  // createImageBitmap が失敗した場合はエラーとして利用者に伝える。
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('この画像形式は読み込めませんでした。JPEG または PNG の画像を選んでください。')
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, MAX_EDGE)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('画像を処理できませんでした。')
  // 透過PNGを JPEG にするときに黒くならないよう白で塗る
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error('画像を変換できませんでした。')
  return { blob, width, height }
}
