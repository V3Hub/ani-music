// Vercel Serverless Function — 通用 HTTP 反代
//
// 访问路径：/api/proxy?target=<encodeURIComponent(目标URL)>
// 例：/api/proxy?target=https%3A%2F%2Fwww.buguyy.top%2Fapi%2Fsearch%3Fkeyword%3D%E7%88%B1%E4%BD%A0
//
// 作用：Cloudflare Worker 的出口 IP 段被上游封禁，这里借 Vercel 的出网 IP
// （与 Cloudflare 不同 ASN）绕开黑名单。
// 本目录带 package.json（type=commonjs），确保函数按 CJS 加载，
// 不受仓库根 package.json 的 type=module 影响。

const { env: procEnv } = require('node:process')

module.exports = async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`)

  // key 校验：必须在 Vercel 项目环境变量里配置 PROXY_KEY
  const expectedKey = procEnv.PROXY_KEY || ''
  if (!expectedKey) {
    return json(res, { code: 500, msg: '服务端未配置 PROXY_KEY' }, 500)
  }
  if ((url.searchParams.get('key') || '') !== expectedKey) {
    return json(res, { code: 401, msg: 'key 校验失败' }, 401)
  }

  const target = url.searchParams.get('target') || ''

  if (!target) {
    return json(res, { code: 400, msg: '缺少 target 参数' }, 400)
  }

  let parsed
  try {
    parsed = new URL(target)
  } catch {
    return json(res, { code: 400, msg: 'target 不是合法 URL', target }, 400)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return json(res, { code: 400, msg: '仅支持 http/https', target }, 400)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)

  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': `${parsed.origin}/`,
        'Origin': parsed.origin,
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
