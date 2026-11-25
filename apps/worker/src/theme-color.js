import { jsonResp } from './http.js'

export const themeColorCache = new Map()
export const FALLBACK_PALETTE = ['#7a3b3b', '#3b5a7a', '#4c3b7a', '#7a6a3b', '#3b7a5a', '#7a3b6a']

/**
 * 上报歌曲缺失元信息 POST /api/song/meta
 * body: { id, duration?, themeColor? }
 *  - duration：只在库里为空/0 时补写，不覆盖上游更准确的数据
 *  - themeColor：写入 songs.theme_color
 */
export async function handleUpdateSongMeta(request, env) {
  const body = await request.json().catch(() => ({}))
  const id = body.id
  if (id === undefined || id === null || id === '') return jsonResp({ code: 400, msg: 'id不能为空' })

  const DB = env.DB
  const song = await DB.prepare('SELECT id, duration FROM songs WHERE id = ?').bind(id).first()
  if (!song) return jsonResp({ code: 404, msg: '歌曲不存在' })

  let updated = false

  const duration = Number(body.duration)
  if (Number.isFinite(duration) && duration > 0 && !(Number(song.duration) > 0)) {
    await DB.prepare('UPDATE songs SET duration = ? WHERE id = ?').bind(Math.round(duration), id).run()
    updated = true
  }

  const themeColor = typeof body.themeColor === 'string' ? body.themeColor.trim() : ''
  if (/^#[0-9a-f]{6}$/i.test(themeColor)) {
    await DB.prepare('UPDATE songs SET theme_color = ? WHERE id = ?').bind(themeColor, id).run()
    // 同步刷新 isolate 缓存，避免旧颜色继续命中
    const cached = themeColorCache.get(String(id))
    if (cached) cached.color = themeColor
    updated = true
  }

  return jsonResp({ code: 200, msg: updated ? '上报成功' : '无需更新', data: { id } })
}

/**
 * 通过歌曲 id 查封面主题色
 * GET /api/song/theme-color?id=xxx
 * 返回 { id, pic, color, rgb, fallback }
 */
export async function handleGetSongThemeColor(request, env) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id') || ''
  if (!id) return jsonResp({ code: 400, msg: 'id不能为空' })

  if (themeColorCache.has(id)) {
    return jsonResp({ code: 200, msg: '请求成功', data: themeColorCache.get(id) })
  }

  const row = await env.DB.prepare('SELECT id, cover_url, theme_color FROM songs WHERE id = ?').bind(id).first()
  if (!row) return jsonResp({ code: 404, msg: '歌曲不存在' })

  const pic = row.cover_url || ''

  // 库里已有客户端上报的主题色：直接复用，省掉封面下载 + 解码
  if (row.theme_color) {
    const data = { id: row.id, pic, color: row.theme_color, rgb: hexToRgb(row.theme_color), fallback: false }
    if (themeColorCache.size > 500) themeColorCache.clear()
    themeColorCache.set(id, data)
    return jsonResp({ code: 200, msg: '请求成功', data })
  }

  let color = ''
  let fallback = false
  try {
    color = await extractThemeColor(pic)
  } catch (e) {
    console.warn('[theme-color] 取色失败', id, e.message)
    color = FALLBACK_PALETTE[hashSeed(pic || String(id)) % FALLBACK_PALETTE.length]
    fallback = true
  }

  const data = { id: row.id, pic, color, rgb: hexToRgb(color), fallback }
  // 失败结果不缓存，下次重试；成功结果按 isolate 缓存
  if (!fallback) {
    if (themeColorCache.size > 500) themeColorCache.clear()
    themeColorCache.set(id, data)
  }
  return jsonResp({ code: 200, msg: '请求成功', data })
}

/** 取封面平均色：直接下载原图，在 Worker 内解码（JPEG / PNG），不依赖任何外部服务 */
export async function extractThemeColor(picUrl) {
  if (!picUrl) throw new Error('缺少封面地址')
  let source = picUrl
  if (source.startsWith('//')) source = `https:${source}`
  source = source.replace(/^http:\/\//, 'https://')

  const res = await fetch(source, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AinMusicWorker/1.0)' },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`封面请求失败 ${res.status}`)

  const buffer = await res.arrayBuffer()
  const bytes = new Uint8Array(buffer)

  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    const [r, g, b] = decodeJpegAverageColor(bytes)
    return rgbToHex(r, g, b)
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    const [r, g, b] = await decodePngAverageColor(buffer)
    return rgbToHex(r, g, b)
  }
  throw new Error('不支持的图片格式')
}

/**
 * 解码 PNG 并返回平均 RGB
 * 仅支持 8 位色深、非隔行；覆盖 RGB/RGBA/灰度/灰度+Alpha/调色板
 */
export async function decodePngAverageColor(buffer) {
  const bytes = new Uint8Array(buffer)
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47
  if (!isPng) throw new Error('不是 PNG 数据')

  let pos = 8
  let width = 0
  let height = 0
  let colorType = 0
  let bitDepth = 0
  let palette = null
  const idatChunks = []

  while (pos + 8 <= bytes.length) {
    const length = readUint32(bytes, pos)
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7])
    const start = pos + 8
    if (type === 'IHDR') {
      width = readUint32(bytes, start)
      height = readUint32(bytes, start + 4)
      bitDepth = bytes[start + 8]
      colorType = bytes[start + 9]
      if (bytes[start + 12] !== 0) throw new Error('不支持隔行 PNG')
    } else if (type === 'PLTE') {
      palette = bytes.slice(start, start + length)
    } else if (type === 'IDAT') {
      idatChunks.push(bytes.slice(start, start + length))
    } else if (type === 'IEND') {
      break
    }
    pos = start + length + 4
  }

  if (!width || !height) throw new Error('PNG 尺寸无效')
  if (bitDepth !== 8) throw new Error(`不支持 ${bitDepth} 位色深`)

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`不支持的颜色类型 ${colorType}`)

  const total = idatChunks.reduce((n, c) => n + c.length, 0)
  const compressed = new Uint8Array(total)
  let offset = 0
  for (const chunk of idatChunks) {
    compressed.set(chunk, offset)
    offset += chunk.length
  }
  const raw = await inflateZlib(compressed)

  const stride = width * channels
  const pixels = new Uint8Array(height * stride)
  let src = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[src++]
    const rowStart = y * stride
    const prevStart = (y - 1) * stride
    for (let x = 0; x < stride; x++) {
      const value = raw[src++]
      const a = x >= channels ? pixels[rowStart + x - channels] : 0
      const b = y > 0 ? pixels[prevStart + x] : 0
      const c = x >= channels && y > 0 ? pixels[prevStart + x - channels] : 0
      let out = value
      if (filter === 1) {
        out = value + a
      } else if (filter === 2) {
        out = value + b
      } else if (filter === 3) {
        out = value + ((a + b) >> 1)
      } else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        out = value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
      }
      pixels[rowStart + x] = out & 0xFF
    }
  }

  let r = 0
  let g = 0
  let b = 0
  const count = width * height
  for (let i = 0; i < count; i++) {
    const o = i * channels
    if (colorType === 3) {
      const idx = pixels[o] * 3
      r += palette[idx] || 0
      g += palette[idx + 1] || 0
      b += palette[idx + 2] || 0
    } else if (colorType === 0 || colorType === 4) {
      const v = pixels[o]
      r += v
      g += v
      b += v
    } else {
      r += pixels[o]
      g += pixels[o + 1]
      b += pixels[o + 2]
    }
  }
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)]
}

/** 解压 zlib 流（PNG IDAT 为 zlib 格式） */
export async function inflateZlib(data) {
  const stream = new Response(data).body.pipeThrough(new DecompressionStream('deflate'))
  const out = await new Response(stream).arrayBuffer()
  return new Uint8Array(out)
}

/** 读取大端 32 位无符号整数（PNG 块长度 / 宽高等） */
export function readUint32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

/** 字符串哈希：把封面地址稳定映射到兜底调色板下标 */
export function hashSeed(text) {
  let hash = 0
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  return hash
}

/** RGB 转 #rrggbb（分量自动夹到 0-255） */
export function rgbToHex(r, g, b) {
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`
}

/** #rrggbb 转 [r, g, b]；非法输入返回黑色 */
export function hexToRgb(hex) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return match ? [Number.parseInt(match[1], 16), Number.parseInt(match[2], 16), Number.parseInt(match[3], 16)] : [0, 0, 0]
}

/** 四舍五入并夹到 0-255 的整数 */
export function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)))
}

// ===================== JPEG 平均色 =====================

/**
 * 完全自研的 JPEG 平均色提取：
 * DCT 的 DC 系数就是 8×8 块的均值，因此不需要反量化 + IDCT 逐像素渲染，
 * 只要按 Huffman 表把每个块的 DC 解出来加权平均，即可得到整图平均色。
 * 支持基线（SOF0/SOF1）与渐进式（SOF2）；渐进式只解 DC 首扫，其余扫描按字节跳过。
 */
export function decodeJpegAverageColor(data) {
  if (data[0] !== 0xFF || data[1] !== 0xD8) throw new Error('不是 JPEG 数据')

  const quant = []
  const huffDC = []
  const huffAC = []
  let frame = null
  let restartInterval = 0
  let adobeTransform = -1
  let sums = []
  let counts = []

  let pos = 2
  while (pos < data.length) {
    if (data[pos] !== 0xFF) {
      pos++
      continue
    }
    let marker = data[pos + 1]
    while (marker === 0xFF) {
      pos++
      marker = data[pos + 1]
    }
    pos += 2

    if (marker === 0xD9) break
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue

    if (marker === 0xDA) {
      if (!frame) throw new Error('JPEG 缺少 SOF')
      const scan = parseScanHeader(data, pos)
      const isDCFirst = scan.ss === 0 && scan.se === 0 && scan.ah === 0
      pos = frame.progressive && !isDCFirst
        ? skipEntropy(data, scan.dataStart)
        : decodeScan(data, scan, frame, quant, huffDC, huffAC, restartInterval, sums, counts)
      continue
    }

    if (pos + 2 > data.length) break
    const len = readU16(data, pos)
    const start = pos + 2
    const end = Math.min(pos + len, data.length)

    if (marker === 0xDB) {
      parseDqt(data, start, end, quant)
    } else if (marker === 0xC4) {
      parseDht(data, start, end, huffDC, huffAC)
    } else if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
      frame = parseSof(data, start, end, marker === 0xC2)
      sums = frame.components.map(() => 0)
      counts = frame.components.map(() => 0)
    } else if (marker === 0xDD) {
      restartInterval = readU16(data, start)
    } else if (marker === 0xEE) {
      adobeTransform = parseAdobeTransform(data, start, end)
    }
    pos = end
  }

  if (!frame) throw new Error('JPEG 缺少 SOF')
  const means = frame.components.map((_, i) => {
    if (!counts[i]) throw new Error('JPEG 未解析到有效数据')
    return 128 + sums[i] / (8 * counts[i])
  })

  if (means.length === 1) return [clamp255(means[0]), clamp255(means[0]), clamp255(means[0])]
  if (means.length < 3) throw new Error('不支持的 JPEG 分量数')

  if (adobeTransform === 0)
    return [clamp255(means[0]), clamp255(means[1]), clamp255(means[2])]

  const y = means[0]
  const cb = means[1] - 128
  const cr = means[2] - 128
  return [
    clamp255(y + 1.402 * cr),
    clamp255(y - 0.344 * cb - 0.714 * cr),
    clamp255(y + 1.772 * cb),
  ]
}

/** 解码一个扫描段（基线全系数 / 渐进式 DC 首扫） */
export function decodeScan(data, scan, frame, quant, huffDC, huffAC, restartInterval, sums, counts) {
  const entries = scan.components.map((sc) => {
    const index = frame.components.findIndex(c => c.id === sc.id)
    if (index < 0) throw new Error('扫描分量不存在')
    return { index, comp: frame.components[index], dc: sc.dc, ac: sc.ac }
  })

  const reader = createBitReader(data, scan.dataStart)
  const predictors = frame.components.map(() => 0)
  const useAC = !frame.progressive

  let units = 0
  if (entries.length > 1) {
    units = Math.ceil(frame.width / (8 * frame.maxH)) * Math.ceil(frame.height / (8 * frame.maxV))
  } else {
    const comp = entries[0].comp
    const blockCols = Math.ceil(Math.ceil((frame.width * comp.h) / frame.maxH) / 8)
    const blockRows = Math.ceil(Math.ceil((frame.height * comp.v) / frame.maxV) / 8)
    units = blockCols * blockRows
  }

  for (let u = 0; u < units; u++) {
    if (restartInterval > 0 && u > 0 && u % restartInterval === 0) {
      reader.consumeRestart()
      predictors.fill(0)
    }
    if (entries.length > 1) {
      for (const entry of entries) {
        const blocks = entry.comp.h * entry.comp.v
        for (let b = 0; b < blocks; b++)
          decodeBlock(reader, entry, useAC, scan.al, quant, huffDC, huffAC, predictors, sums, counts)
      }
    } else {
      decodeBlock(reader, entries[0], useAC, scan.al, quant, huffDC, huffAC, predictors, sums, counts)
    }
  }

  return reader.getPosition()
}

/**
 * 解一个 8×8 块：解 DC 差分并把「块均值」累加到 sums
 * 基线模式下还要继续解 AC 系数，只为推进码流（不参与取色）
 */
export function decodeBlock(reader, entry, useAC, al, quant, huffDC, huffAC, predictors, sums, counts) {
  const dcTable = huffDC[entry.dc]
  if (!dcTable) throw new Error('缺少 DC Huffman 表')

  const size = decodeHuffman(reader, dcTable)
  const diff = size === 0 ? 0 : extendValue(reader.readBits(size), size)

  const ci = entry.index
  predictors[ci] += diff

  const q00 = (quant[entry.comp.tq] && quant[entry.comp.tq][0]) || 1
  sums[ci] += (predictors[ci] << al) * q00
  counts[ci] += 1

  if (!useAC)
    return

  const acTable = huffAC[entry.ac]
  if (!acTable) throw new Error('缺少 AC Huffman 表')

  let k = 1
  while (k < 64) {
    const rs = decodeHuffman(reader, acTable)
    const s = rs & 15
    const r = rs >> 4
    if (s === 0) {
      if (r === 15) {
        k += 16
        continue
      }
      break
    }
    k += r
    reader.readBits(s)
    k++
  }
}

/** 熵编码字节流读取器：处理 0xFF00 填充与 RST 重启标记 */
export function createBitReader(data, start) {
  let pos = start
  let current = 0
  let bitsLeft = 0

  /** 读下一个熵编码字节：0xFF00 填充按 0xFF 处理，遇到真实 marker 返回 0 */
  function nextByte() {
    if (pos >= data.length) return 0
    const byte = data[pos]
    if (byte === 0xFF) {
      let p = pos + 1
      while (p < data.length && data[p] === 0xFF) p++
      if (p < data.length && data[p] === 0x00) {
        pos = p + 1
        return 0xFF
      }
      return 0
    }
    pos++
    return byte
  }

  return {
    readBit() {
      if (bitsLeft === 0) {
        current = nextByte()
        bitsLeft = 8
      }
      bitsLeft--
      return (current >> bitsLeft) & 1
    },
    readBits(n) {
      let value = 0
      for (let i = 0; i < n; i++) value = (value << 1) | this.readBit()
      return value
    },
    consumeRestart() {
      bitsLeft = 0
      let p = pos
      while (p < data.length && data[p] !== 0xFF) p++
      while (p < data.length && data[p] === 0xFF) p++
      if (p < data.length && data[p] >= 0xD0 && data[p] <= 0xD7) p++
      pos = p
    },
    getPosition() {
      return pos
    },
  }
}

/** 解析 SOS 扫描头：分量与 Huffman 表选择、Ss/Se/Ah/Al、熵数据起始位置 */
export function parseScanHeader(data, pos) {
  const len = readU16(data, pos)
  const start = pos + 2
  const n = data[start]
  const components = []
  let p = start + 1
  for (let i = 0; i < n; i++) {
    components.push({ id: data[p], dc: data[p + 1] >> 4, ac: data[p + 1] & 15 })
    p += 2
  }
  return {
    components,
    ss: data[p],
    se: data[p + 1],
    ah: data[p + 2] >> 4,
    al: data[p + 2] & 15,
    dataStart: p + 3,
    end: pos + len,
  }
}

/** 解析 DQT 量化表（zigzag 顺序存放，下标 0 即 DC 系数） */
export function parseDqt(data, start, end, quant) {
  let p = start
  while (p < end) {
    const pqTq = data[p++]
    const precision = pqTq >> 4
    const id = pqTq & 15
    const table = new Uint16Array(64)
    for (let i = 0; i < 64; i++) {
      if (precision === 0) {
        table[i] = data[p++]
      } else {
        table[i] = readU16(data, p)
        p += 2
      }
    }
    quant[id] = table
  }
}

/** 解析 DHT Huffman 表：按类别（0=DC / 1=AC）与表 id 存入数组 */
export function parseDht(data, start, end, huffDC, huffAC) {
  let p = start
  while (p < end) {
    const tcTh = data[p++]
    const cls = tcTh >> 4
    const id = tcTh & 15
    const counts = new Uint8Array(17)
    let total = 0
    for (let i = 1; i <= 16; i++) {
      counts[i] = data[p++]
      total += counts[i]
    }
    const symbols = new Uint8Array(total)
    for (let i = 0; i < total; i++) symbols[i] = data[p++]

    const table = buildHuffmanTable(counts, symbols)
    if (cls === 0) huffDC[id] = table
    else huffAC[id] = table
  }
}

/** 解析 SOF 帧头：图像尺寸、是否渐进式、各分量采样因子与量化表 id */
export function parseSof(data, start, end, progressive) {
  const height = readU16(data, start + 1)
  const width = readU16(data, start + 3)
  const n = data[start + 5]
  if (!width || !height) throw new Error('JPEG 尺寸无效')
  if (end - start < 6 + n * 3) throw new Error('JPEG SOF 数据不完整')

  const components = []
  let maxH = 1
  let maxV = 1
  let p = start + 6
  for (let i = 0; i < n; i++) {
    const h = data[p + 1] >> 4 || 1
    const v = data[p + 1] & 15 || 1
    components.push({ id: data[p], h, v, tq: data[p + 2] })
    if (h > maxH) maxH = h
    if (v > maxV) maxV = v
    p += 3
  }
  return { width, height, progressive, components, maxH, maxV }
}

/** 解析 APP14(Adobe) 段：transform 为 0 表示分量是 RGB 而不是 YCbCr */
export function parseAdobeTransform(data, start, end) {
  if (end - start < 12) return -1
  const tag = String.fromCharCode(data[start], data[start + 1], data[start + 2], data[start + 3], data[start + 4])
  return tag === 'Adobe' ? data[start + 11] : -1
}

/** 按码长分布构建规范 Huffman 表：数组下标为码长，内部 Map 为 code → symbol */
export function buildHuffmanTable(counts, symbols) {
  const tables = Array.from({ length: 17 })
  let code = 0
  let k = 0
  for (let len = 1; len <= 16; len++) {
    const map = new Map()
    for (let i = 0; i < counts[len]; i++) map.set(code++, symbols[k++])
    tables[len] = map
    code <<= 1
  }
  return tables
}

/** 逐位读取并查 Huffman 表，返回解出的符号 */
export function decodeHuffman(reader, table) {
  let code = 0
  for (let len = 1; len <= 16; len++) {
    code = (code << 1) | reader.readBit()
    const symbol = table[len].get(code)
    if (symbol !== undefined) return symbol
  }
  throw new Error('Huffman 解码失败')
}

/** JPEG 幅值扩展：把 size 位无符号值还原成有符号差分 */
export function extendValue(value, size) {
  return value < 1 << (size - 1) ? value - (1 << size) + 1 : value
}

/** 字节级跳过熵编码段，直到下一个真实 marker（跳过 0xFF00 与 RSTn） */
export function skipEntropy(data, start) {
  let pos = start
  while (pos < data.length) {
    if (data[pos] === 0xFF) {
      let p = pos + 1
      while (p < data.length && data[p] === 0xFF) p++
      if (p >= data.length) return p
      const marker = data[p]
      if (marker === 0x00 || (marker >= 0xD0 && marker <= 0xD7)) {
        pos = p + 1
        continue
      }
      return pos
    }
    pos++
  }
  return pos
}

/** 读取大端 16 位整数（JPEG 段长度等） */
export function readU16(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1]
}
