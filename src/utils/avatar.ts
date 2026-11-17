/**
 * 头像解析：数据库 avatar_url 存 base64 时自动补全 data URL
 * 支持直接存 data:image/...;base64,xxx、http(s) 地址或裸 base64 字符串
 */
export function resolveAvatar(raw?: string | null, fallback = '') {
  const value = (raw || '').trim()
  if (!value)
    return fallback
  if (/^(?:https?:|data:|\/)/i.test(value))
    return value
  // 裸 SVG 源码
  if (/^<(?:\?xml|svg)/i.test(value))
    return `data:image/svg+xml,${encodeURIComponent(value)}`

  // 裸 base64：去掉换行等空白后按魔术字节判断真实格式
  const base64 = value.replace(/\s+/g, '')
  const mime = base64.startsWith('/9j/')
    ? 'jpeg'
    : base64.startsWith('UklGR')
      ? 'webp'
      : base64.startsWith('R0lGOD')
        ? 'gif'
        : base64.startsWith('PHN2Zy') || base64.startsWith('PD94bWw')
          ? 'svg+xml'
          : 'png'
  return `data:image/${mime};base64,${base64}`
}
