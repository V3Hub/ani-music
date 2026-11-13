/**
 * 封面主题色服务 —— 从歌曲封面提取主色，联动全局界面主题。
 *
 *  原理：
 *  1. 把封面图画到离屏 canvas（降采样到 32x32 提速）
 *  2. 遍历像素，按色相分桶，选饱和度最高的桶的平均色作为主题色
 *  3. 衍生出背景渐变、文字色等 CSS 变量，写入 :root
 *  4. 封面跨域导致本地取色失败时，回退到后端 /api/song/theme-color 的解析结果
 */
import type { Song } from '@/types/music'
import { getSongThemeColor } from '@/api/music'
import { reportSongThemeColor } from '@/services/song-meta-reporter'

const DEFAULT_COLOR = '#000000'

/** 从封面图提取主题色（hex） */
export function extractThemeColor(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const size = 32
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx)
          return resolve(DEFAULT_COLOR)

        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)

        // 按色相分桶，挑饱和度最高的桶的平均色
        const buckets = new Map<number, { r: number, g: number, b: number, count: number }>()
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const a = data[i + 3]
          if (a < 125)
            continue

          const { h, s } = rgbToHsl(r, g, b)
          // 跳过近白/近黑（饱和度太低）
          if (s < 0.2)
            continue

          const bucketKey = Math.floor(h / 20)
          const bucket = buckets.get(bucketKey) ?? { r: 0, g: 0, b: 0, count: 0 }
          bucket.r += r
          bucket.g += g
          bucket.b += b
          bucket.count += 1
          buckets.set(bucketKey, bucket)
        }

        let best = DEFAULT_COLOR
        let bestScore = -1
        for (const bucket of buckets.values()) {
          if (bucket.count === 0)
            continue
          const r = Math.round(bucket.r / bucket.count)
          const g = Math.round(bucket.g / bucket.count)
          const b = Math.round(bucket.b / bucket.count)
          const { s } = rgbToHsl(r, g, b)
          const score = s * bucket.count
          if (score > bestScore) {
            bestScore = score
            best = rgbToHex(r, g, b)
          }
        }
        resolve(best)
      } catch {
        resolve(DEFAULT_COLOR)
      }
    }
    img.onerror = () => resolve(DEFAULT_COLOR)
    img.src = imageUrl
  })
}

/**
 * 把主题色应用到全局 CSS 变量。
 * 会衍生出渐变背景、深色文字色等。
 */
export function applyThemeColor(hex: string) {
  const rgb = hexToRgb(hex)
  if (!rgb)
    return

  const { r, g, b } = rgb
  // 背景只用纯色：主题色同色系压暗，保证白色文字可读
  const darker = shade(rgb, -0.55)

  const root = document.documentElement
  root.style.setProperty('--theme-primary', hex)
  root.style.setProperty('--theme-background', darker)
  root.style.setProperty('--theme-rgb', `${r}, ${g}, ${b}`)
  // 文字色按「实际背景色」的亮度决定黑白，保证与背景对比度足够
  const bgRgb = hexToRgb(darker)
  const bgLuminance = bgRgb
    ? (0.299 * bgRgb.r + 0.587 * bgRgb.g + 0.114 * bgRgb.b) / 255
    : 0
  root.style.setProperty('--theme-text', bgLuminance > 0.55 ? '#1a1a2e' : '#ffffff')
}

/** 计算歌曲主题色：本地 canvas 优先，跨域失败时回退后端解析结果 */
async function resolveThemeColor(song: Song): Promise<string> {
  const color = await extractThemeColor(song.pic ?? '')
  if (color !== DEFAULT_COLOR)
    return color
  const serverTheme = await getSongThemeColor(song.id)
  return serverTheme && !serverTheme.fallback ? serverTheme.color : color
}

/** 把主题色写入 song 对象并应用到全局 */
export async function syncThemeColor(song: Song) {
  if (song.themeColor) {
    applyThemeColor(song.themeColor)
    return
  }
  if (!song.pic)
    return

  song.themeColor = await resolveThemeColor(song)
  applyThemeColor(song.themeColor)
  // 歌曲原本没有主题色：把算出来的颜色回报后端，下次可直接复用
  reportSongThemeColor(song, song.themeColor)
}

/**
 * 预取主题色：只计算并缓存到 song.themeColor，不改变当前界面
 * 提前算好下一首，切歌时可直接复用，避免背景色延迟跳变
 */
export async function prefetchThemeColor(song?: Song | null) {
  if (!song?.pic || song.themeColor)
    return
  song.themeColor = await resolveThemeColor(song)
  reportSongThemeColor(song, song.themeColor)
}

// ========== 颜色工具 ==========

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  const l = (max + min) / 2
  const d = max - min
  let s = 0
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }
  return { h: h * 360, s, l }
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function hexToRgb(hex: string): { r: number, g: number, b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m)
    return null
  return { r: Number.parseInt(m[1], 16), g: Number.parseInt(m[2], 16), b: Number.parseInt(m[3], 16) }
}

/** 按比例调暗/调亮 percent: -1~1 */
function shade(rgb: { r: number, g: number, b: number }, percent: number): string {
  const t = percent < 0 ? 0 : 255
  const p = Math.abs(percent)
  const r = Math.round((t - rgb.r) * p) + rgb.r
  const g = Math.round((t - rgb.g) * p) + rgb.g
  const b = Math.round((t - rgb.b) * p) + rgb.b
  return rgbToHex(r, g, b)
}
