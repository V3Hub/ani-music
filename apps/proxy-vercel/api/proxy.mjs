// Vercel Serverless Function — 反代 buguyy / bugumusic 上游
//
// 访问路径：/api/proxy?target=<encodeURIComponent(完整上游URL)>
// 例：/api/proxy?target=https%3A%2F%2Fwww.buguyy.top%2Fapi%2Fsearch%3Fkeyword%3D%E7%88%B1%E4%BD%A0
//
// 作用：Cloudflare Worker 的出口 IP 段被上游封禁，这里借 Vercel 的
// 出网 IP（与 Cloudflare 不同 ASN）绕开黑名单。
// 使用 .mjs 扩展名显式声明 ESM，避免无 package.json 时被按 CommonJS 加载。

// SSRF 防护：只允许反代这些上游
const ALLOWED_ORIGINS = [
  'https://www.buguyy.top/',
  'https://bugumusic.com/',
  'https://api.music.126.net/',
]

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`)
  const target = url.searchParams.get('target') || ''

  if (!target) {
    return json(res, { code: 400, msg: '缺少 target 参数' }, 400)
  }

  if (!ALLOWED_ORIGINS.some(prefix => target.startsWith(prefix))) {
    return json(res, { code: 403, msg: '目标域名不在白名单', target }, 403)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)

  try {
    const targetUrl = new URL(target)
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': `${targetUrl.origin}/`,
        'Origin': targetUrl.origin,
        'Accept': 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
      },
      signal: controller.signal,
    })

    const body = new Uint8Array(await upstream.arrayBuffer())

    res.statusCode = upstream.status
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'no-store')
    res.end(body)
  } catch (err) {
    json(res, { code: 502, msg: '上游请求失败', detail: err.message }, 502)
  } finally {
    clearTimeout(timer)
  }
}

function json(res, obj, status = 200) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(obj))
}
