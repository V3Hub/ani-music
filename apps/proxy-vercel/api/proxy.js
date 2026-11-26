// Vercel Edge Function — 反代 buguyy / bugumusic 上游
//
// 访问路径：/api/proxy?target=<encodeURIComponent(完整上游URL)>
// 例：/api/proxy?target=https%3A%2F%2Fwww.buguyy.top%2Fapi%2Fsearch%3Fkeyword%3D%E7%88%B1%E4%BD%A0
//
// 作用：Cloudflare Worker 的出口 IP 段被上游封禁，这里借 Vercel 边缘网络
// （不同 ASN）出网，绕开黑名单。

export const config = { runtime: 'edge' }

// SSRF 防护：只允许反代这些上游
const ALLOWED_ORIGINS = [
  'https://www.buguyy.top/',
  'https://bugumusic.com/',
  'https://api.music.126.net/',
]

export default async function handler(req) {
  const url = new URL(req.url)

  const target = url.searchParams.get('target') || ''
  if (!target) {
    return json({ code: 400, msg: '缺少 target 参数' }, 400)
  }

  if (!ALLOWED_ORIGINS.some(prefix => target.startsWith(prefix))) {
    return json({ code: 403, msg: '目标域名不在白名单', target }, 403)
  }

  try {
    const targetUrl = new URL(target)
    const res = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': `${targetUrl.origin}/`,
        'Origin': targetUrl.origin,
        'Accept': 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
      },
      signal: AbortSignal.timeout(10000),
    })

    const body = await res.arrayBuffer()

    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return json({ code: 502, msg: '上游请求失败', detail: err.message }, 502)
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
