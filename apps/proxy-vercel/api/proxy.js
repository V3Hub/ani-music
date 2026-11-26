// Vercel Serverless Function — 通用 HTTP 反代
// 访问路径：/api/proxy?key=<PROXY_KEY>&target=<encodeURIComponent(目标URL)>

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
    return json(res, { code: 400, msg: 'target 不是合法 URL' }, 400)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return json(res, { code: 400, msg: '仅支持 http/https' }, 400)
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': `${parsed.origin}/`,
        'Origin': parsed.origin,
        'Accept': 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
      },
      signal: AbortSignal.timeout(10000),
    })

    const body = new Uint8Array(await upstream.arrayBuffer())

    res.statusCode = upstream.status
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'no-store')
    res.end(body)
  } catch {
    json(res, { code: 502, msg: '上游请求失败' }, 502)
  }
}

function json(res, obj, status = 200) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.end(JSON.stringify(obj))
}
