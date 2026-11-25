/**
 * 51.LA 推广埋点：统一上报到 Advertisement 自定义事件，
 * 附带切面信息（动作、页面、来源渠道、时间）与业务参数，便于做推广转化分析。
 * 注意：51.LA 限制自定义参数 key ≤ 25 字符、value ≤ 64 字符，这里统一裁剪。
 */
interface LaSdk {
  track?: (event: string, params?: Record<string, unknown>) => void
}

/** 取 51.LA SDK 实例：脚本未加载成功时静默跳过，不影响业务 */
function getLa(): LaSdk | undefined {
  return (window as Window & { LA?: LaSdk }).LA
}

/** 推广渠道参数：支持常见 UTM 及自定义 from/channel */
function getChannelParams(): Record<string, string> {
  const query = new URLSearchParams(window.location.search)
  const channel: Record<string, string> = {}
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'from', 'channel']) {
    const value = query.get(key)
    if (value)
      channel[key] = value
  }
  return channel
}

/** 按 51.LA 的限制裁剪参数，超长值直接截断，避免上报失败 */
function normalizeParams(params: Record<string, unknown>) {
  const payload: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value == null || typeof value === 'object' || key.length > 25)
      continue
    payload[key] = String(value).slice(0, 64)
  }
  return payload
}

/**
 * 上报推广行为
 * @param action 行为标识，如 coupon_click / welfare_view
 * @param params 业务明细（券名称、金额、链接等）
 */
export function trackPromotion(action: string, params: Record<string, unknown> = {}) {
  const la = getLa()
  if (!la?.track)
    return

  la.track('Advertisement', normalizeParams({
    action,
    page: window.location.pathname,
    referrer: document.referrer || 'direct',
    ...getChannelParams(),
    time: Date.now(),
    ...params,
  }))
}
