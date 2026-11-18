/** 统一响应头（CORS + JSON） */
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json',
}
/** token 签名密钥，与前端的鉴权约定保持一致 */
const SECRET_KEY = 'musapi.v3hub.site'
/** 密码哈希盐值：前端「密码生成工具」与服务端共用，保证生成的存储值可直接登录 */
const PASSWORD_SALT = 'ani-music'
/** 最近播放 / 收藏 / 歌单的最大保存条数 */
const MAX_PLAYLIST_COUNT = 100

/**
 * 生成用户 token：base64(userId) + SHA-256(userId + SECRET_KEY) 签名
 * 同一 userId 每次生成的 token 都一致，便于直接复用
 */
async function generateToken(userId) {
  const payload = `${userId}`
  const payloadB64 = btoa(payload)
  const encoder = new TextEncoder()
  const hashData = encoder.encode(payload + SECRET_KEY)
  const hashBuffer = await crypto.subtle.digest('SHA-256', hashData)
  const signHex = Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
  return `${payloadB64}.${signHex}`
}
/**
 * 从 Authorization: Bearer <token> 中解析并校验用户 id
 * @returns {Promise<number|null>} 格式非法 / 签名不匹配时返回 null
 */
async function getUserIdFromToken(request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null
  const token = authHeader.replace('Bearer ', '').trim()
  const tokenParts = token.split('.')
  if (tokenParts.length !== 2) return null
  const [payloadB64, clientSign] = tokenParts
  let payloadRaw
  try {
    payloadRaw = atob(payloadB64)
  } catch {
    return null
  }
  const userId = parseInt(payloadRaw)
  if (Number.isNaN(userId)) return null
  const encoder = new TextEncoder()
  const hashData = encoder.encode(payloadRaw + SECRET_KEY)
  const hashBuffer = await crypto.subtle.digest('SHA-256', hashData)
  const serverSign = Array.from(new Uint8Array(hashBuffer))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
  if (serverSign !== clientSign) return null
  return userId
}
/** 判定是否为正常浏览器请求：UA 为空或命中爬虫关键字时返回 false */
function isHumanRequest(request) {
  const ua = (request.headers.get('user-agent') ?? '').toLowerCase()
  const botList = [
    'spider',
    'crawler',
    'scrapy',
    'curl',
    'wget',
    'python-requests',
    'go-http-client',
  ]
  if (!ua) return false
  return !botList.some(w => ua.includes(w))
}
/** 判定来源是否允许：仅本站域名与本地开发环境 */
function isAllowedReferer(request) {
  const ref = request.headers.get('referer')
  if (!ref) return false
  const allowDomain = [
    'https://v3hub.cc.cd',
    'https://53hub.cc.cd',
    'https://v3hub.site',
    'https://music.ani.l.cd',
    'http://localhost',
    'http://199.28.',
  ]
  return allowDomain.some(w => ref.startsWith(w))
}
/** 统一 JSON 响应：自动带上 CORS 头与指定状态码 */
function jsonResp(data, status = 200) {
  return Response.json(data, { headers, status })
}

/**
 * 上游歌曲接口地址映射：加歌与取播放地址共用
 * @returns {string} 不支持的 source 返回空串
 */
function buildSongApiUrl(source, id) {
  const rid = encodeURIComponent(id)
  switch (source) {
    case 'netease':
      return `https://api.qijieya.cn/meting/?type=song&id=${rid}`
    case 'qq':
      return `https://tang.api.s01s.cn/music_open_api.php?mid=${rid}`
    case 'mitu':
      return `https://www.qqmp3.vip/api/kw.php?rid=${rid}&type=json&level=exhigh&lrc=true`
    default:
      return ''
  }
}

/**
 * 上游搜索接口地址映射
 * @returns {string} 不支持的 source 返回空串
 */
function buildSearchApiUrl(source, keyword, page, num) {
  const word = encodeURIComponent(keyword)
  switch (source) {
    case 'netease':
      return `https://api.vkeys.cn/v2/music/netease?word=${word}&page=${page}&num=${num}`
    case 'qq':
      return `https://tang.api.s01s.cn/music_open_api.php?msg=${word}&type=json`
    case 'mitu':
      return `https://www.qqmp3.vip/api/songs.php?type=search&keyword=${word}`
    default:
      return ''
  }
}

/**
 * 数据库歌曲行 → 前端统一 Song 结构
 * 默认只返回列表所需的基础信息，不含歌词与收藏状态：
 * 歌词、收藏都在歌曲开始播放时通过 /api/song/detail 拉取
 * @param {object} item 查询结果行
 * @param {{ withLyric?: boolean, withFavorite?: boolean }} [options]
 */
function mapSongRow(item, options = {}) {
  const song = {
    id: item.id,
    singer: item.artist || '',
    title: item.title || '',
    url: item.audio_url || '',
    pic: item.cover_url || '',
    duration: item.duration || 0,
    album: item.album || '',
    publishTime: item.publish_time || '',
  }
  if (options.withLyric) song.lrc = item.lyric || ''
  if (options.withFavorite) {
    song.favorite = Boolean(item.favorite)
    song.favoriteCount = Number(item.favorite_count) || 0
  }
  // 客户端上报过主题色时才带上，避免列表里出现空字段
  if (item.theme_color) song.themeColor = item.theme_color
  return song
}

/**
 * 往「用户歌曲列表」追加一条：超过上限时先淘汰 sort 最小（最早）的一条
 * @param {object} DB D1 数据库实例
 * @param {'user_play_record'|'user_favorite'} table 内部固定表名
 * @param {number} userId 用户 id
 * @param {number} total 当前条数
 */
async function trimOldestIfFull(DB, table, userId, total) {
  if (total < MAX_PLAYLIST_COUNT) return
  await DB.prepare(`DELETE FROM ${table} WHERE user_id = ? ORDER BY sort ASC LIMIT 1`).bind(userId).run()
}

/**
 * 删除用户及其全部关联记录
 * 评论、心愿等表的 user_id 以文本存储，比较时同时匹配数字与字符串
 * @param {object} DB D1 数据库实例
 * @param {number} userId 用户 id
 */
async function deleteUserCascade(DB, userId) {
  const id = Number(userId) || 0
  const text = String(userId)
  await DB.batch([
    // 播放记录、收藏、分享
    DB.prepare('DELETE FROM user_play_record WHERE user_id = ?').bind(id),
    DB.prepare('DELETE FROM user_favorite WHERE user_id = ?').bind(id),
    DB.prepare('DELETE FROM share_user WHERE user_id = ?').bind(id),
    // 歌单：先删歌单内歌曲与订阅，再删歌单
    DB.prepare('DELETE FROM playlist_song WHERE playlist_id IN (SELECT id FROM user_playlist WHERE user_id = ?)').bind(id),
    DB.prepare('DELETE FROM user_playlist_sub WHERE playlist_id IN (SELECT id FROM user_playlist WHERE user_id = ?)').bind(id),
    DB.prepare('DELETE FROM user_playlist_sub WHERE user_id = ?').bind(id),
    DB.prepare('DELETE FROM user_playlist WHERE user_id = ?').bind(id),
    // 评论：先清点赞与下属回复，再删自己的评论
    DB.prepare(
      `DELETE FROM song_comment_like
       WHERE user_id IN (?, ?)
          OR comment_id IN (SELECT id FROM song_comment WHERE user_id IN (?, ?))`,
    ).bind(id, text, id, text),
    DB.prepare('DELETE FROM song_comment WHERE parent_id IN (SELECT id FROM song_comment WHERE user_id IN (?, ?))').bind(id, text),
    DB.prepare('DELETE FROM song_comment WHERE user_id IN (?, ?)').bind(id, text),
    // 心愿：先清心愿的点赞与留言，再删心愿本身
    DB.prepare(
      `DELETE FROM wish_like
       WHERE user_id IN (?, ?)
          OR wish_id IN (SELECT id FROM wish WHERE user_id IN (?, ?))`,
    ).bind(id, text, id, text),
    DB.prepare(
      `DELETE FROM wish_message
       WHERE user_id IN (?, ?)
          OR wish_id IN (SELECT id FROM wish WHERE user_id IN (?, ?))`,
    ).bind(id, text, id, text),
    DB.prepare('DELETE FROM wish WHERE user_id IN (?, ?)').bind(id, text),
    // VIP 记录、注册申请
    DB.prepare('DELETE FROM vip_record WHERE user_id = ?').bind(id),
    DB.prepare('DELETE FROM registration_request WHERE user_id = ?').bind(id),
    // 最后删除用户本体
    DB.prepare('DELETE FROM users WHERE id = ?').bind(id),
  ])
}

/** 路由表：path → method → 处理函数，统一由 fetch 分发 */
const ROUTES = {
  '/api/user/auto': { POST: handleAutoLogin },
  '/api/user/login': { POST: handleUserLogin },
  '/api/user/profile': { GET: handleGetUserProfile, POST: handleUpdateUserProfile },
  '/api/user/register': { POST: handleRegister },
  '/api/user/register/status': { GET: handleRegisterStatus },
  '/api/admin/registrations': { GET: handleAdminListRegistrations },
  '/api/admin/registration/review': { POST: handleAdminReviewRegistration },
  '/api/admin/user/vip-level': { POST: handleAdminSetVipLevel },
  '/api/admin/user/vip-records': { GET: handleAdminVipRecords },
  '/api/song/add': { POST: handleUpsertSong },
  '/api/recommend/hot': { GET: handleGetHotList },
  '/api/playRecord/list': { GET: handleGetRecentPlay },
  '/api/playRecord/add': { POST: handleAddRecentPlay },
  '/api/playRecord/remove': { POST: handleRemoveRecentPlay },
  '/api/music/search': { GET: handleSearchMusic },
  '/api/song/stream': { GET: handleSongStreamRedirect },
  '/api/favorite/list': { GET: handleGetFavorites },
  '/api/favorite/add': { POST: handleAddFavorite },
  '/api/favorite/remove': { POST: handleRemoveFavorite },
  '/api/playlist/owner': { GET: handleGetMyPlaylists },
  '/api/playlist/create': { POST: handleCreatePlaylist },
  '/api/subPlaylist/create': { POST: handleSubscribePlaylist },
  '/api/playlist/delete': { POST: handleDeletePlaylist },
  '/api/subPlaylist/delete': { POST: handleUnsubscribePlaylist },
  '/api/playlist/detail': { GET: handleGetPlaylistDetail },
  '/api/playlist/add-song': { POST: handleAddPlaylistSong },
  '/api/playlist/sort-song': { POST: handleSortPlaylistSongs },
  '/api/playlist/demote-song': { POST: handleDemotePlaylistSong },
  '/api/playlist/remove-song': { POST: handleRemovePlaylistSong },
  '/api/playlist/discover': { GET: handleGetDiscoverPlaylists },
  '/api/playlist/search': { GET: handleSearchPlaylists },
  '/api/playlist/info': { GET: handleGetPlaylistInfo },
  '/api/share/token': { GET: handleCreateShareToken },
  '/api/share/resolve': { GET: handleResolveShareToken },
  '/api/song/detail': { GET: handleGetSongDetail },
  '/api/song/share': { GET: handleGetSongShareCount, POST: handleReportSongShare },
  '/api/song/comment': { GET: handleGetComments, POST: handleAddComment },
  '/api/song/comment/count': { GET: handleGetCommentCount },
  '/api/song/comment/like': { POST: handleToggleCommentLike },
  '/api/song/comment/delete': { POST: handleDeleteComment },
  '/api/wish/list': { GET: handleGetWishes },
  '/api/wish/add': { POST: handleAddWish },
  '/api/wish/like': { POST: handleToggleWishLike },
  '/api/wish/messages': { GET: handleGetWishMessages },
  '/api/wish/message/add': { POST: handleAddWishMessage },
  '/api/wish/delete': { POST: handleDeleteWish },
  '/api/playlist/share': { GET: handleGetPlaylistShareCount, POST: handleReportPlaylistShare },
  '/api/song/theme-color': { GET: handleGetSongThemeColor },
  '/api/song/meta': { POST: handleUpdateSongMeta },
}

/** 免 token 白名单：自动登录；播放直链跳转（audio 元素请求无法携带 Authorization 头） */
const PUBLIC_PATHS = new Set([
  '/api/user/auto',
  '/api/user/login',
  '/api/user/register',
  '/api/user/register/status',
  '/api/song/stream',
])

/** 已确认存在的用户 id 缓存：userId → 校验时间戳（isolate 内存，5 分钟有效） */
const userAliveCache = new Map()
const USER_ALIVE_TTL = 5 * 60 * 1000
const USER_ALIVE_MAX = 1000

/**
 * 校验 token 中的 userId 在 users 表里是否仍然存在
 * 定时任务会清理长期未活跃用户，被清理用户的旧 token 签名仍然合法，
 * 这里补一次存在性校验，避免其写入孤儿数据；结果做短期缓存降低 D1 读取次数
 */
async function isUserAlive(DB, userId) {
  const seenAt = userAliveCache.get(userId)
  if (seenAt && Date.now() - seenAt < USER_ALIVE_TTL) return true

  const row = await DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(userId).first()
  if (!row?.id) {
    userAliveCache.delete(userId)
    return false
  }
  if (userAliveCache.size >= USER_ALIVE_MAX) userAliveCache.clear()
  userAliveCache.set(userId, Date.now())
  return true
}

/** 当前请求已校验的 userId：fetch 入口写入，业务方法按需读取，避免层层传参 */
const requestUserIds = new WeakMap()

/** 取当前请求的 userId（全局已校验，必定存在） */
function getRequestUserId(request) {
  return requestUserIds.get(request) ?? null
}

export default {
  /**
   * Worker 入口：先做爬虫与来源校验、token 校验，再按 path + method 分发到各业务方法
   */
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers })
    }
    if (!isHumanRequest(request)) return jsonResp({ code: 403, msg: '禁止爬虫访问' }, 403)
    if (!isAllowedReferer(request)) return jsonResp({ code: 403, msg: '非法请求来源' }, 403)

    const path = new URL(request.url).pathname
    const isPublicPath = PUBLIC_PATHS.has(path)
    let userId = null
    try {
      // 除免 token 接口、内部任务外，其余接口都必须携带有效 token，且用户仍然存在
      if (!isPublicPath && !path.startsWith('/internal/')) {
        userId = await getUserIdFromToken(request)
        if (!userId) return jsonResp({ code: 401, msg: '登录状态已失效，请重新登录' }, 401)
        if (!(await isUserAlive(env.DB, userId)))
          return jsonResp({ code: 401, msg: '账号已失效，请重新登录' }, 401)
        // 写入当前请求上下文，业务方法用 getRequestUserId 直接读取
        requestUserIds.set(request, userId)
      }

      // 业务接口：查路由表统一分发
      const handler = ROUTES[path]?.[request.method]
      if (handler) return await handler(request, env)

      // 手动执行统计任务接口
      if (path === '/internal/run-hot-stat-task' && request.method === 'GET') {
        await this.scheduled(null, env, ctx)
        return jsonResp({ code: 200, msg: '请求成功' })
      }
      return jsonResp({ code: 404, msg: '接口不存在' }, 404)
    } catch (e) {
      // 打印完整错误信息+堆栈，日志里就能看到真实原因
      console.error('【全局500异常】', e.message, '\n堆栈：', e.stack)
      return jsonResp({ code: 500, msg: '服务器内部错误' }, 500)
    }
  },
  /** 定时任务：清理 30 天内无任何活动的非 VIP 用户（热度在推荐接口实时统计） */
  async scheduled(event, env, _ctx) {
    const DB = env.DB
    try {
      // 清理 30 天内没有任何活动的非 VIP 用户（VIP 与有歌单/收藏等记录的用户保留）
      const { results } = await DB.prepare(
        `
      SELECT u.id FROM users u
      WHERE COALESCE(u.vip_level, 0) = 0
        AND NOT EXISTS (
          SELECT 1 FROM user_play_record p
          WHERE p.user_id = u.id
            AND p.create_time >= DATETIME(DATE('now', '-30 day'))
        )
        AND NOT EXISTS (
          SELECT 1 FROM song_comment c
          WHERE c.user_id IN (u.id, CAST(u.id AS TEXT))
            AND c.create_time >= DATETIME(DATE('now', '-30 day'))
        )
        AND NOT EXISTS (
          SELECT 1 FROM wish w
          WHERE w.user_id IN (u.id, CAST(u.id AS TEXT))
            AND w.create_time >= DATETIME(DATE('now', '-30 day'))
        )
        AND NOT EXISTS (
          SELECT 1 FROM wish_message m
          WHERE m.user_id IN (u.id, CAST(u.id AS TEXT))
            AND m.create_time >= DATETIME(DATE('now', '-30 day'))
        )
        AND NOT EXISTS (SELECT 1 FROM user_favorite f WHERE f.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM user_playlist pl WHERE pl.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM user_playlist_sub s WHERE s.user_id = u.id)
      LIMIT 200
    `,
      ).all()
      // 逐个删除用户及其关联记录，避免留下孤儿数据
      for (const user of results || [])
        await deleteUserCascade(DB, user.id)
    } catch (err) {
      console.error('【定时任务异常】', err.message, err.stack)
    }
  },
}

/**
 * 自动登录 POST /api/user/auto
 * 优先复用请求携带的有效 token，其次按 IP + 指纹匹配老用户，最后才新建用户
 */
async function handleAutoLogin(request, env) {
  const DB = env.DB

  // 1. 请求已带 token：校验签名并确认用户仍存在，直接复用（避免换 IP 后重复建号）
  const authHeader = request.headers.get('Authorization') || ''
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '').trim()
    const tokenUserId = await getUserIdFromToken(request)
    if (tokenUserId) {
      const row = await DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(tokenUserId).first()
      if (row?.id) {
        return jsonResp({ code: 200, data: token })
      }
    }
  }

  // 2. 没有有效 token：按指纹匹配已有用户，不存在再新建
  const body = await request.json().catch(() => ({}))
  let fingerprint = body.fingerprint
  fingerprint = fingerprint?.trim() || null
  const clientIP = request.headers.get('cf-connecting-ip') || 'unknown_ip'
  const raw = `${clientIP}###${fingerprint}`
  const enc = new TextEncoder()
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(raw))
  const base64Hash = btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
  const fingerId = base64Hash.slice(0, 22)
  if (fingerId) {
    const row = await DB.prepare(`SELECT id FROM users WHERE finger_id = ?`).bind(fingerId).first()
    if (row?.id) {
      return jsonResp({ code: 200, data: await generateToken(row.id) })
    }
  }

  // 3. 新建用户并返回新 token
  await DB.prepare(`INSERT INTO users (finger_id) VALUES (?)`).bind(fingerId).run()
  const row = await DB.prepare(`SELECT last_insert_rowid() AS id`).first()
  return jsonResp({ code: 200, data: await generateToken(row.id) })
}

/** SHA-256 十六进制摘要 */
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** users 行 → 前端用户信息（头像以 base64 / data URL 形式原样下发） */
function mapUserProfile(row) {
  return {
    id: row.id,
    username: row.username || '',
    nickname: row.nickname || '',
    avatar: row.avatar_url || '',
    isAdmin: !!row.is_admin,
    /** VIP 等级：0 非会员，1+ 永久 VIP 等级 */
    vipLevel: Number(row.vip_level) || 0,
  }
}

/**
 * 记录最近登录时间到 users.last_login（DATETIME，UTC）
 * 表结构缺少该列时只打日志，不影响登录流程
 */
async function touchLastLogin(env, userId) {
  if (!userId)
    return
  try {
    await env.DB.prepare('UPDATE users SET last_login = DATETIME(\'now\') WHERE id = ?')
      .bind(userId)
      .run()
  } catch (err) {
    console.error('【last_login 更新失败】', err.message)
  }
}

/**
 * 账号密码登录 POST /api/user/login
 * account 支持用户名 / 手机号 / 邮箱任一匹配；密码以 SHA-256(密码 + PASSWORD_SALT) 存储
 * 同一字符串命中多个账号且密码都正确时返回候选列表，由前端选择后再带 userId 登录
 */
async function handleUserLogin(request, env) {
  const body = await request.json().catch(() => ({}))
  const account = String(body.account || body.username || '').trim()
  const password = String(body.password || '')
  if (!account || !password) {
    return jsonResp({ code: 400, msg: '请输入账号和密码' })
  }
  const { results } = await env.DB.prepare(
    `SELECT id, username, password, nickname, avatar_url, is_admin, vip_level FROM users
     WHERE username = ? OR (phone IS NOT NULL AND phone != '' AND phone = ?)
        OR (email IS NOT NULL AND email != '' AND email = ?)
     ORDER BY id ASC`,
  )
    .bind(account, account, account)
    .all()
  const hashed = await sha256Hex(password + PASSWORD_SALT)
  // 密码校验通过的账号才可能是候选，避免泄露其他人的用户名
  let matched = (results || []).filter(row => row?.id && row.password === hashed)
  // 前端已选择具体账号时只保留该账号
  const pickedId = Number(body.userId) || 0
  if (pickedId)
    matched = matched.filter(row => row.id === pickedId)

  if (!matched.length) {
    return jsonResp({ code: 400, msg: '账号或密码错误' })
  }
  if (matched.length > 1) {
    return jsonResp({
      code: 200,
      msg: '请选择要登录的账号',
      data: {
        needChoose: true,
        accounts: matched.map(row => ({
          id: row.id,
          username: row.username || '',
          nickname: row.nickname || '',
          avatar: row.avatar_url || '',
          vipLevel: Number(row.vip_level) || 0,
        })),
      },
    })
  }
  const row = matched[0]
  await touchLastLogin(env, row.id)
  return jsonResp({
    code: 200,
    msg: '登录成功',
    data: { token: await generateToken(row.id), user: mapUserProfile(row) },
  })
}

/** 当前登录用户信息 GET /api/user/profile */
async function handleGetUserProfile(request, env) {
  const userId = getRequestUserId(request)
  const row = await env.DB.prepare(
    `SELECT id, username, nickname, avatar_url, is_admin, vip_level FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first()
  if (!row?.id) {
    return jsonResp({ code: 401, msg: '账号不存在' }, 401)
  }
  return jsonResp({ code: 200, msg: '请求成功', data: mapUserProfile(row) })
}

/**
 * 修改当前用户资料 POST /api/user/profile
 * body: { username?, nickname?, avatar? }，未传的字段保持原值
 */
async function handleUpdateUserProfile(request, env) {
  const userId = getRequestUserId(request)
  const body = await request.json().catch(() => ({}))
  const row = await env.DB.prepare(
    `SELECT id, username, nickname, avatar_url, is_admin, vip_level FROM users WHERE id = ?`,
  )
    .bind(userId)
    .first()
  if (!row?.id) {
    return jsonResp({ code: 401, msg: '账号不存在' }, 401)
  }

  const username = body.username === undefined ? (row.username || '') : String(body.username).trim()
  const nickname = body.nickname === undefined ? (row.nickname || '') : String(body.nickname).trim()
  const avatar = body.avatar === undefined ? (row.avatar_url || '') : String(body.avatar)

  if (!username)
    return jsonResp({ code: 400, msg: '用户名不能为空' })
  if (username.length < 2 || username.length > 20)
    return jsonResp({ code: 400, msg: '用户名需 2-20 个字符' })
  if (!nickname)
    return jsonResp({ code: 400, msg: '昵称不能为空' })
  if (nickname.length > 20)
    return jsonResp({ code: 400, msg: '昵称最多 20 个字符' })
  if (avatar && avatar.length > 300 * 1024)
    return jsonResp({ code: 400, msg: '头像图片过大，请重新选择' })

  if (username !== row.username) {
    const dup = await env.DB.prepare(
      'SELECT id FROM users WHERE username = ? AND id != ? LIMIT 1',
    ).bind(username, userId).first()
    if (dup)
      return jsonResp({ code: 400, msg: '该用户名已被占用' })
  }

  await env.DB.prepare(
    'UPDATE users SET username = ?, nickname = ?, avatar_url = ? WHERE id = ?',
  ).bind(username, nickname, avatar, userId).run()

  return jsonResp({
    code: 200,
    msg: '已保存',
    data: mapUserProfile({ ...row, username, nickname, avatar_url: avatar }),
  })
}

/**
 * 会员注册申请 POST /api/user/register
 * 必填：用户名、昵称、密码、付款截图；选填：手机号、邮箱
 * 提交后进入 registration_request 待审批，管理员通过后才写入 users 生效
 */
async function handleRegister(request, env) {
  const body = await request.json().catch(() => ({}))
  const username = String(body.username || '').trim()
  const nickname = String(body.nickname || '').trim()
  const password = String(body.password || '')
  const phone = String(body.phone || '').trim()
  const email = String(body.email || '').trim()
  const screenshot = String(body.paymentScreenshot || '')

  if (!username || !nickname || !password) {
    return jsonResp({ code: 400, msg: '用户名、昵称、密码为必填项' })
  }
  if (!/^\w{3,20}$/.test(username)) {
    return jsonResp({ code: 400, msg: '用户名需为 3-20 位字母、数字或下划线' })
  }
  if (nickname.length > 20) {
    return jsonResp({ code: 400, msg: '昵称最长 20 个字符' })
  }
  if (password.length < 6) {
    return jsonResp({ code: 400, msg: '密码至少 6 位' })
  }
  if (phone && !/^1\d{10}$/.test(phone)) {
    return jsonResp({ code: 400, msg: '手机号格式不正确' })
  }
  if (email && !/^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/.test(email)) {
    return jsonResp({ code: 400, msg: '邮箱格式不正确' })
  }
  if (!screenshot) {
    return jsonResp({ code: 400, msg: '请上传付款截图' })
  }
  // base64 截图限制约 600KB，避免 D1 单行过大
  if (screenshot.length > 600 * 1024) {
    return jsonResp({ code: 400, msg: '截图过大，请压缩后再上传' })
  }

  const DB = env.DB
  // user_id 必填：注册必须绑定当前 userToken
  const submitterId = await getUserIdFromToken(request)
  if (!submitterId)
    return jsonResp({ code: 401, msg: '登录状态已失效，请刷新页面后重试' })
  // 同一 userToken 已有审批中 / 已通过的申请时，不允许再次提交（被拒绝的可以重新申请）
  const mine = await DB.prepare(
    `SELECT status FROM registration_request
     WHERE user_id = ? AND status IN ('pending', 'approved') ORDER BY id DESC LIMIT 1`,
  ).bind(submitterId).first()
  if (mine) {
    return jsonResp({
      code: 400,
      msg: mine.status === 'approved' ? '当前账号已完成注册，不能重复申请' : '当前账号已有待审批申请，请耐心等待',
    })
  }
  // 用户名需全局唯一；手机号、邮箱允许重复，登录时再用密码区分
  const dupUser = await DB.prepare(
    'SELECT id FROM users WHERE username = ? LIMIT 1',
  ).bind(username).first()
  if (dupUser)
    return jsonResp({ code: 400, msg: '该用户名已被注册' })
  // 与待审批申请查重（被拒绝的允许重新提交）
  const dupPending = await DB.prepare(
    `SELECT id FROM registration_request WHERE status = 'pending' AND username = ? LIMIT 1`,
  ).bind(username).first()
  if (dupPending)
    return jsonResp({ code: 400, msg: '该用户名已有待审批申请，请耐心等待' })

  const hashed = await sha256Hex(password + PASSWORD_SALT)
  await DB.prepare(
    `INSERT INTO registration_request
       (user_id, username, nickname, password, phone, email, payment_screenshot, status, create_time)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', DATETIME('now'))`,
  ).bind(submitterId, username, nickname, hashed, phone, email, screenshot).run()
  return jsonResp({ code: 200, msg: '注册申请已提交，请等待管理员审批' })
}

/**
 * 注册审批进度查询 GET /api/user/register/status
 * 不传 username 时按当前 userToken 查询（默认方式）；显式传 username 时按用户名查询
 * 返回最近一条申请的状态（不含截图、密码等敏感信息）
 */
async function handleRegisterStatus(request, env) {
  const url = new URL(request.url)
  const username = String(url.searchParams.get('username') || '').trim()
  const FIELDS = 'username, nickname, status, reject_reason, create_time, review_time'

  if (username) {
    const row = await env.DB.prepare(
      `SELECT ${FIELDS} FROM registration_request WHERE username = ? ORDER BY id DESC LIMIT 1`,
    ).bind(username).first()
    if (!row) {
      return jsonResp({ code: 404, msg: '未找到该用户名的注册申请' })
    }
    return jsonResp({ code: 200, data: row })
  }

  const userId = await getUserIdFromToken(request)
  if (!userId) {
    return jsonResp({ code: 400, msg: '请输入用户名' })
  }
  const row = await env.DB.prepare(
    `SELECT ${FIELDS} FROM registration_request WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
  ).bind(userId).first()
  // 当前账号没有申请时返回 null，前端静默展示「暂无申请」
  return jsonResp({ code: 200, data: row || null })
}

/** 校验当前请求是否来自管理员，是则返回管理员 id */
async function requireAdmin(request, env) {
  const userId = await getUserIdFromToken(request)
  if (!userId)
    return null
  const row = await env.DB.prepare('SELECT id, is_admin FROM users WHERE id = ?').bind(userId).first()
  if (!row?.id || !row.is_admin)
    return null
  return row.id
}

/** 管理员：注册申请列表 GET /api/admin/registrations?status=pending|approved|rejected|all */
async function handleAdminListRegistrations(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const url = new URL(request.url)
  const status = String(url.searchParams.get('status') || 'pending')
  const where = status === 'all' ? '' : `WHERE status = '${status.replace(/[^a-z]/g, '')}'`
  const { results } = await env.DB.prepare(
    `SELECT id, user_id, username, nickname, phone, email, payment_screenshot, status,
            reject_reason, create_time, review_time
     FROM registration_request ${where} ORDER BY id DESC LIMIT 100`,
  ).all()
  return jsonResp({ code: 200, data: results || [] })
}

/**
 * 管理员：审批 POST /api/admin/registration/review
 * body: { id, action: 'approve' | 'reject', rejectReason? }
 * 通过时直接更新提交者的 users 记录（vip_level = 1），账号即刻生效
 */
async function handleAdminReviewRegistration(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id)
  const action = String(body.action || '')
  const rejectReason = String(body.rejectReason || '').trim()
  if (!id || !['approve', 'reject'].includes(action)) {
    return jsonResp({ code: 400, msg: '参数不完整' })
  }
  const DB = env.DB
  const req = await DB.prepare(`SELECT * FROM registration_request WHERE id = ?`).bind(id).first()
  if (!req?.id)
    return jsonResp({ code: 404, msg: '申请不存在' })
  if (req.status !== 'pending')
    return jsonResp({ code: 400, msg: '该申请已处理，请刷新列表' })

  if (action === 'reject') {
    await DB.prepare(
      `UPDATE registration_request
       SET status = 'rejected', reject_reason = ?, review_time = DATETIME('now'), reviewer_id = ?
       WHERE id = ?`,
    ).bind(rejectReason || '未通过审核', adminId, id).run()
    return jsonResp({ code: 200, msg: '已拒绝该申请' })
  }

  // 通过：直接更新提交申请的那个用户（同 userToken 无需重新登录）
  // user_id 为必填，申请未绑定用户时不允许通过
  const targetUserId = Number(req.user_id) || 0
  if (!targetUserId)
    return jsonResp({ code: 400, msg: '该申请未绑定用户，无法通过' })

  // 用户名需排除自身；手机号、邮箱允许重复
  const dup = await DB.prepare(
    'SELECT id FROM users WHERE id != ? AND username = ? LIMIT 1',
  ).bind(targetUserId, req.username).first()
  if (dup)
    return jsonResp({ code: 400, msg: '用户名已被占用，请拒绝该申请' })

  const exist = await DB.prepare('SELECT id, vip_level FROM users WHERE id = ?').bind(targetUserId).first()
  if (!exist?.id)
    return jsonResp({ code: 400, msg: '申请对应的用户不存在' })
  const fromLevel = Number(exist.vip_level) || 0

  // 注册成功即为永久 VIP（vip_level = 1）
  await DB.prepare(
    `UPDATE users
     SET username = ?, nickname = ?, password = ?, phone = ?, email = ?, vip_level = 1
     WHERE id = ?`,
  ).bind(req.username, req.nickname, req.password, req.phone || null, req.email || null, targetUserId).run()
  await DB.prepare(
    `INSERT INTO vip_record (user_id, from_level, to_level, change_type, remark, operator_id, create_time)
     VALUES (?, ?, 1, 'register', '注册审批通过，开通永久 VIP', ?, DATETIME('now'))`,
  ).bind(targetUserId, fromLevel, adminId).run()
  await DB.prepare(
    `UPDATE registration_request
     SET status = 'approved', review_time = DATETIME('now'), reviewer_id = ? WHERE id = ?`,
  ).bind(adminId, id).run()
  return jsonResp({ code: 200, msg: '已通过，账号已生效（永久 VIP）' })
}

/**
 * 管理员：调整用户 VIP 等级 POST /api/admin/user/vip-level
 * body: { username, level, remark? }，level 1-9；变更写入 vip_record
 */
async function handleAdminSetVipLevel(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const body = await request.json().catch(() => ({}))
  const username = String(body.username || '').trim()
  const level = Number(body.level)
  const remark = String(body.remark || '').trim()
  if (!username || !Number.isInteger(level) || level < 1 || level > 9) {
    return jsonResp({ code: 400, msg: '参数错误：level 需为 1-9 的整数' })
  }
  const DB = env.DB
  const user = await DB.prepare('SELECT id, vip_level FROM users WHERE username = ?').bind(username).first()
  if (!user?.id)
    return jsonResp({ code: 404, msg: '用户不存在' })
  const fromLevel = Number(user.vip_level) || 0
  if (fromLevel === level)
    return jsonResp({ code: 400, msg: '该用户已是此等级' })
  await DB.prepare('UPDATE users SET vip_level = ? WHERE id = ?').bind(level, user.id).run()
  await DB.prepare(
    `INSERT INTO vip_record (user_id, from_level, to_level, change_type, remark, operator_id, create_time)
     VALUES (?, ?, ?, 'admin', ?, ?, DATETIME('now'))`,
  ).bind(user.id, fromLevel, level, remark || `管理员调整等级 VIP${fromLevel} → VIP${level}`, adminId).run()
  return jsonResp({ code: 200, msg: `已调整为 VIP${level}`, data: { userId: user.id, vipLevel: level } })
}

/** 管理员：用户 VIP 变更记录 GET /api/admin/user/vip-records?username=xxx */
async function handleAdminVipRecords(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const url = new URL(request.url)
  const username = String(url.searchParams.get('username') || '').trim()
  if (!username)
    return jsonResp({ code: 400, msg: '请输入用户名' })
  const user = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first()
  if (!user?.id)
    return jsonResp({ code: 404, msg: '用户不存在' })
  const { results } = await env.DB.prepare(
    `SELECT id, from_level, to_level, change_type, remark, create_time
     FROM vip_record WHERE user_id = ? ORDER BY id DESC LIMIT 50`,
  ).bind(user.id).all()
  return jsonResp({ code: 200, data: results || [] })
}

/**
 * 添加 / 复用歌曲 POST /api/song/add
 * 以 source_song_id 去重；首次入库时回源音源接口补全封面、歌词、时长等元信息
 */
async function handleUpsertSong(request, env) {
  const body = await request.json().catch(() => ({}))
  const { lrc = '', pic = '', singer = '', title = '', source = '', id = '', album = '' } = body
  if (!source || !String(title).trim()) {
    return jsonResp({ code: 400, msg: 'source、title 不能为空' })
  }
  const DB = env.DB

  // 已入库直接复用
  const existRow = await DB.prepare(
    `SELECT id, title, artist, cover_url, audio_url, lyric, album FROM songs WHERE source_song_id = ?`,
  )
    .bind(String(id))
    .first()
  if (existRow?.id) {
    return jsonResp({ code: 200, msg: '请求成功', data: mapSongRow(existRow) })
  }

  // 首次入库：回源补全元信息（失败则沿用请求参数）
  const apiUrl = buildSongApiUrl(source, id)
  const fetchUrl = `https://musapi.v3hub.site/api/song/stream?source=${source}&id=${encodeURIComponent(id)}`
  let fetchLrc = lrc
  let fetchPic = pic
  let duration = 0
  let fetchAlbum = album
  let genre = ''
  let releaseTime = null
  if (apiUrl) {
    try {
      const upstream = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': new URL(apiUrl).origin,
        },
        cf: { cacheTtl: 60, cacheEverything: true },
      })
        .then(res => res.json())
        .catch(() => null)
      if (upstream) {
        switch (source) {
          case 'netease': {
            const lrcRes = await fetch(upstream[0].lrc, {
              method: 'GET',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': new URL(upstream[0].lrc).origin,
              },
              cf: { cacheTtl: 60, cacheEverything: true },
            })
            fetchLrc = await lrcRes.text().catch(() => null)
            break
          }
          case 'qq':
            fetchPic = upstream?.album_pic
            fetchLrc = upstream?.song_lyric
            duration = Number(upstream?.song_play_time || 0)
            fetchAlbum = upstream?.album_name || ''
            genre = upstream?.genre || ''
            releaseTime = upstream?.public_time || null
            break
          case 'mitu':
            fetchLrc = upstream?.data?.lrc
            break
        }
      }
    } catch (fetchErr) {
      console.error('音源接口请求失败：', source, apiUrl, fetchErr)
    }
  }

  const insertResult = await DB.prepare(`
    INSERT INTO songs
    (title, artist, cover_url, audio_url, lyric, duration, album, genre, release_time, source_song_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .bind(
      String(title).trim(),
      String(singer).trim(),
      fetchPic,
      fetchUrl,
      fetchLrc,
      duration,
      fetchAlbum,
      genre,
      releaseTime,
      String(id),
    )
    .run()

  const inserted = {
    id: insertResult.meta.last_row_id,
    title: String(title).trim(),
    artist: String(singer).trim(),
    cover_url: fetchPic,
    audio_url: fetchUrl,
    lyric: fetchLrc,
    duration,
    album: fetchAlbum,
    publish_time: releaseTime,
  }
  return jsonResp({ code: 200, msg: '请求成功', data: mapSongRow(inserted) })
}
/**
 * 热门推荐 GET /api/recommend/hot
 * 综合热度、偏好与新鲜度打分：
 *  - 热度：日榜权重高于周榜，避免旧热歌长期占位
 *  - 偏好：收藏过的歌手 > 常听歌手，收藏过的歌曲小幅加权
 *  - 去重：听过的歌降权，同一歌手最多两首
 *  - 兜底：热度为 0 的新歌按 id 新鲜度加分，保证冷启动也有内容
 */
async function handleGetHotList(request, env) {
  const DB = env.DB
  const userId = getRequestUserId(request)

  // 候选池：全部歌曲带上近 7 天实时热度，最多取 300 首参与排序
  const { results } = await DB.prepare(
    `
    SELECT s.*,
           COALESCE(h.day_plays, 0) AS day_plays,
           COALESCE(h.week_plays, 0) AS week_plays
    FROM songs s
    LEFT JOIN (
      SELECT song_id,
             COUNT(*) AS week_plays,
             SUM(CASE
               WHEN create_time >= DATETIME(DATE('now', '-1 day'))
                AND create_time < DATETIME('now') THEN 1 ELSE 0
             END) AS day_plays
      FROM user_play_record
      WHERE create_time >= DATETIME(DATE('now', '-6 day'))
      GROUP BY song_id
    ) h ON h.song_id = s.id
    ORDER BY (COALESCE(h.day_plays, 0) * 3 + COALESCE(h.week_plays, 0)) DESC,
             s.id DESC
    LIMIT 300
  `,
  ).all()
  const rows = results || []
  if (!rows.length)
    return jsonResp({ code: 200, msg: '请求成功', data: [] })

  const maxIdRow = await DB.prepare('SELECT COALESCE(MAX(id), 1) AS maxId FROM songs').first()
  const maxId = Number(maxIdRow?.maxId) || 1

  // 用户偏好信号：收藏歌曲、历史播放、歌手权重
  const favoriteIds = new Set()
  const playedIds = new Set()
  const artistWeight = new Map()
  if (userId) {
    const [favSongs, historySongs] = await Promise.all([
      DB.prepare(
        `
        SELECT s.id, s.artist
        FROM user_favorite f
        JOIN songs s ON s.id = f.song_id
        WHERE f.user_id = ?
      `,
      ).bind(userId).all(),
      DB.prepare(
        `
        SELECT s.id, s.artist
        FROM user_play_record p
        JOIN songs s ON s.id = p.song_id
        WHERE p.user_id = ?
      `,
      ).bind(userId).all(),
    ])
    for (const row of favSongs.results || []) {
      favoriteIds.add(row.id)
      if (row.artist)
        artistWeight.set(row.artist, (artistWeight.get(row.artist) || 0) + 3)
    }
    for (const row of historySongs.results || []) {
      playedIds.add(row.id)
      if (row.artist)
        artistWeight.set(row.artist, (artistWeight.get(row.artist) || 0) + 1)
    }
  }

  const scored = rows.map((row) => {
    const day = Number(row.day_plays) || 0
    const week = Number(row.week_plays) || 0
    // 新鲜度：越新加分越高，最多 12 分，帮助零播放的新歌进入榜单
    const freshness = (Number(row.id) / maxId) * 12
    const affinity = row.artist ? (artistWeight.get(row.artist) || 0) * 2 : 0
    const favoriteBonus = favoriteIds.has(row.id) ? 6 : 0
    // 已经听过的歌降权而不是直接剔除，保留复听可能
    const playedPenalty = playedIds.has(row.id) ? 10 : 0
    const score = day * 3 + week + freshness + affinity + favoriteBonus - playedPenalty
    return { row, score }
  })

  scored.sort((a, b) => b.score - a.score)

  // 同一歌手最多两首，避免整页都是同一个人的歌
  const artistCount = new Map()
  const data = []
  for (const { row } of scored) {
    const artist = row.artist || ''
    if (artist) {
      const used = artistCount.get(artist) || 0
      if (used >= 2) continue
      artistCount.set(artist, used + 1)
    }
    data.push(mapSongRow(row))
    if (data.length >= 30) break
  }

  return jsonResp({ code: 200, msg: '请求成功', data })
}

/** 最近播放列表 GET /api/playRecord/list：按 sort 倒序，只返回基础信息 */
async function handleGetRecentPlay(request, env) {
  const userId = getRequestUserId(request)
  const DB = env.DB
  const { results } = await DB.prepare(
    `
    SELECT
      q.id AS queue_id,
      q.sort,
      s.*
    FROM user_play_record q
    LEFT JOIN songs s ON q.song_id = s.id
    WHERE q.user_id = ?
    ORDER BY q.sort DESC
  `,
  )
    .bind(userId)
    .all()
  const data = results.map(item => mapSongRow(item))
  return jsonResp({ code: 200, msg: '请求成功', data })
}

/**
 * 加入最近播放 POST /api/playRecord/add
 * 超出上限时淘汰最早一条；同一首歌重复加入只刷新时间
 */
async function handleAddRecentPlay(request, env) {
  const userId = getRequestUserId(request)
  const body = await request.json().catch(() => ({}))
  const { songId } = body

  // 参数校验
  if (!songId) {
    return jsonResp({ code: 400, msg: 'userId、songId 不能为空' })
  }
  const DB = env.DB

  try {
    const stat = await DB.prepare(
      `SELECT COUNT(*) AS total, COALESCE(MAX(sort), -1) AS maxIdx FROM user_play_record WHERE user_id = ?`,
    )
      .bind(userId)
      .first()
    // 超限先淘汰最早一条，再写入
    await trimOldestIfFull(DB, 'user_play_record', userId, stat.total)
    await DB.prepare(
      `
      INSERT INTO user_play_record (user_id, song_id, sort)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, song_id)
      DO UPDATE SET create_time = CURRENT_TIMESTAMP
    `,
    )
      .bind(userId, songId, stat.maxIdx + 1)
      .run()
  } catch {
    return jsonResp({ code: 500, msg: '操作失败，请稍后重试' })
  }

  return jsonResp({ code: 200, msg: '添加成功' })
}

/** 从最近播放移除 POST /api/playRecord/remove */
async function handleRemoveRecentPlay(request, env) {
  const userId = getRequestUserId(request)
  const body = await request.json().catch(() => ({}))
  const { songId } = body
  if (!songId) {
    return jsonResp({ code: 400, msg: 'userId、songId 不能为空' })
  }
  const DB = env.DB
  await DB.prepare(
    `
    DELETE FROM user_play_record
    WHERE user_id = ? AND song_id = ?
  `,
  )
    .bind(userId, songId)
    .run()
  return jsonResp({ code: 200, msg: '移除成功' })
}

/**
 * 把各上游搜索结果统一成前端 Song 结构
 * @returns {Array} 统一字段：id / source / title / singer / pic / album / lrc / url
 */
function normalizeSearchResults(source, data) {
  switch (source) {
    case 'netease':
      return Array.isArray(data?.data)
        ? data.data.map(item => ({
            id: item.id,
            source,
            title: item.song || '',
            pic: item.cover || '',
            singer: item.singer || '',
            album: item.album || '',
          }))
        : []
    case 'qq':
      return Array.isArray(data)
        ? data.map(item => ({
            id: item.song_mid || '',
            source,
            title: item.song_title || '',
            singer: item.singer_name || '',
          }))
        : []
    case 'mitu':
      return Array.isArray(data?.data)
        ? data.data.map(item => ({
            id: item.rid || '',
            source,
            title: item.name || '',
            pic: item.pic || '',
            singer: item.artist || '',
          }))
        : []
    default:
      return []
  }
}

/**
 * 多音源搜索 GET /api/music/search
 * 按 source 请求不同上游接口，并把结果统一成 Song 字段结构
 */
async function handleSearchMusic(request, _env) {
  const url = new URL(request.url)
  const keyword = url.searchParams.get('keyword')?.trim() || ''
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const num = Math.min(30, Math.max(1, Number(url.searchParams.get('num')) || 10))
  const source = url.searchParams.get('source') || ''
  if (!keyword) {
    return jsonResp({ code: 400, msg: 'keyword 不能为空' })
  }
  const api = buildSearchApiUrl(source, keyword, page, num)
  if (!api) {
    return jsonResp({ code: 400, msg: '不支持的 source' })
  }

  try {
    const fetchRes = await fetch(api, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': new URL(api).origin,
      },
      cf: { cacheTtl: 300, cacheEverything: true },
    })
    const data = await fetchRes.json().catch(() => {
      throw new Error('上游返回非标准JSON数据')
    })
    return jsonResp({ code: 200, data: normalizeSearchResults(source, data) })
  } catch (err) {
    console.error('接口异常', { source, keyword, api, err: err.message })
    return jsonResp({ code: 5001, msg: '服务繁忙', data: [] })
  }
}

/**
 * 播放地址 GET /api/song/stream
 * 解析上游直链后 302 跳转（netease 需二次请求拿真实地址）
 */
async function handleSongStreamRedirect(request, _env) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id') || ''
  const source = url.searchParams.get('source') || ''
  if (!id || !source) {
    return jsonResp({ code: 400, msg: '资源不存在' })
  }
  const apiUrl = buildSongApiUrl(source, id)
  if (!apiUrl) {
    return jsonResp({ code: 400, msg: '不支持的 source' })
  }
  let finalUrl = ''
  let data
  try {
    const fetchRes = await fetch(apiUrl, {
      signal: AbortSignal.timeout(10000),
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': new URL(apiUrl).origin,
      },
    })
    data = await fetchRes.json().catch(() => null)
    switch (source) {
      case 'netease': {
        const originUrl = data?.[0]?.url
        const resp = await fetch(originUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': new URL(originUrl).origin,
          },
          signal: AbortSignal.timeout(10000),
          redirect: 'follow',
        })
        finalUrl = resp.url
        break
      }
      case 'qq':
        finalUrl = data?.song_play_url
        break
      case 'mitu':
        finalUrl = data?.data?.url
        break
    }
  } catch (err) {
    return jsonResp({ code: 500, msg: `服务繁忙: ${err.message}` })
  }
  if (!finalUrl) {
    return jsonResp({ code: 404, msg: `资源不存在`, data })
  }
  return Response.redirect(finalUrl, 302)
}

/** 收藏列表 GET /api/favorite/list */
async function handleGetFavorites(request, env) {
  const userId = getRequestUserId(request)
  const DB = env.DB
  const { results } = await DB.prepare(
    `
      SELECT q.id queue_id, q.sort, s.*
      FROM user_favorite q
      LEFT JOIN songs s ON q.song_id = s.id
      WHERE q.user_id = ?
      ORDER BY q.sort DESC`,
  )
    .bind(userId)
    .all()
  const data = results.map(item => mapSongRow(item))
  return jsonResp({ code: 200, data })
}
/**
 * 收藏歌曲 POST /api/favorite/add
 * 超出上限时淘汰最早收藏；重复收藏走失败提示
 */
async function handleAddFavorite(request, env) {
  const userId = getRequestUserId(request)
  const body = await request.json().catch(() => ({}))
  const { songId } = body
  // 参数校验
  if (!songId) {
    return jsonResp({ code: 400, msg: 'userId、songId 不能为空' })
  }
  const DB = env.DB

  try {
    const stat = await DB.prepare(
      `SELECT COUNT(*) AS total, COALESCE(MAX(sort), -1) AS maxIdx FROM user_favorite WHERE user_id = ?`,
    )
      .bind(userId)
      .first()
    // 超限先淘汰最早收藏
    await trimOldestIfFull(DB, 'user_favorite', userId, stat.total)
    await DB.prepare(
      `
      INSERT INTO user_favorite (user_id, song_id, sort)
      VALUES (?, ?, ?)
    `,
    )
      .bind(userId, songId, stat.maxIdx + 1)
      .run()
  } catch {
    return jsonResp({ code: 500, msg: '已收藏该歌曲' })
  }
  return jsonResp({ code: 200, msg: `收藏成功` })
}
/** 取消收藏 POST /api/favorite/remove */
async function handleRemoveFavorite(request, env) {
  const userId = getRequestUserId(request)
  const body = await request.json().catch(() => ({}))
  const { songId } = body
  if (!songId) {
    return jsonResp({ code: 400, msg: 'userId、songId 不能为空' })
  }
  const DB = env.DB
  await DB.prepare(
    `
    DELETE FROM user_favorite
    WHERE user_id = ? AND song_id = ?
  `,
  )
    .bind(userId, songId)
    .run()
  return jsonResp({ code: 200, msg: '取消收藏成功' })
}

/** 我的歌单 GET /api/playlist/owner：我创建的 + 我收藏的，带第一首封面与歌曲数 */
async function handleGetMyPlaylists(request, env) {
  const userId = getRequestUserId(request)
  const DB = env.DB
  const { results } = await DB.prepare(
    `
    SELECT
      p.*,
      s.create_time as sub_create_time,
      CASE WHEN s.id IS NOT NULL THEN 0 ELSE 1 END AS owner,
      COALESCE(s.create_time, p.create_time) as sort_time,
      (
        SELECT songs.cover_url
        FROM playlist_song ps
        LEFT JOIN songs ON ps.song_id = songs.id
        WHERE ps.playlist_id = p.id
        ORDER BY ps.sort
        LIMIT 1
      ) as pic,
      (
        SELECT COUNT(*)
        FROM playlist_song ps
        WHERE ps.playlist_id = p.id
      ) as count,
      u.nickname as nickname,
      u.avatar_url as avatar,
      u.vip_level as vip_level
    FROM user_playlist p
    LEFT JOIN user_playlist_sub s
      ON p.id = s.playlist_id AND s.user_id = ?
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.user_id = ? OR s.user_id = ?
    ORDER BY sort_time DESC
  `,
  )
    .bind(userId, userId, userId)
    .all()
  results.forEach(item => (item.owner = Boolean(item.owner)))
  return jsonResp({ code: 200, msg: '获取成功', data: results })
}

/** 创建歌单 POST /api/playlist/create */
async function handleCreatePlaylist(request, env) {
  const userId = getRequestUserId(request)
  const { name, desc } = await request.json()
  if (!name?.trim()) {
    return jsonResp({ code: 400, msg: '歌单名称不能为空' })
  }
  const DB = env.DB
  const res = await DB.prepare(`INSERT INTO user_playlist (user_id, name, desc) VALUES (?, ?, ?)`)
    .bind(userId, name.trim(), desc ?? null)
    .run()
  if (!res.success) {
    return jsonResp({ code: 500, msg: '创建失败' })
  }
  return jsonResp({ code: 200, msg: '创建成功', data: { id: res.meta.last_row_id } })
}
/** 收藏他人歌单 POST /api/subPlaylist/create，不能收藏自己创建的歌单 */
async function handleSubscribePlaylist(request, env) {
  const userId = getRequestUserId(request)
  const body = await request.json()
  const { id } = body
  if (!id) return jsonResp({ code: 400, msg: '歌单id不能为空' })
  const DB = env.DB
  const row = await DB.prepare(`SELECT user_id FROM user_playlist WHERE id = ?`).bind(id).first()
  if (!row) {
    return jsonResp({ code: 404, msg: '歌单不存在' })
  }
  const ownerId = row.user_id
  if (ownerId === userId) {
    return jsonResp({ code: 400, msg: '不可收藏自己创建的歌单' })
  }
  try {
    await DB.prepare(`INSERT INTO user_playlist_sub (user_id, playlist_id) VALUES (?, ?)`)
      .bind(userId, id)
      .run()
    return jsonResp({ code: 200, msg: '收藏成功' })
  } catch {
    return jsonResp({ code: 400, msg: '该歌单已收藏' })
  }
}
/** 歌单详情 GET /api/playlist/detail?id=xx：歌曲列表 + 收藏状态 */
async function handleGetPlaylistDetail(request, env) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')?.trim() || ''
  if (!id) return jsonResp({ code: 400, msg: '缺少歌单id' })
  const DB = env.DB
  const { results } = await DB.prepare(
    `
    SELECT ps.id as rel_id, ps.song_id, ps.sort,
    s.*
    FROM playlist_song ps
    LEFT JOIN songs s ON ps.song_id = s.id
    WHERE ps.playlist_id = ?
    ORDER BY ps.sort
  `,
  )
    .bind(id)
    .all()
  const data = results.map(item => mapSongRow(item))
  return jsonResp({ code: 200, msg: '获取成功', data })
}
/** 歌单添加歌曲 POST /api/playlist/add-song：新歌追加到末尾 */
async function handleAddPlaylistSong(request, env) {
  const { playlistId, id } = await request.json()
  if (!playlistId || !id) return jsonResp({ code: 400, msg: '参数不全' })
  const DB = env.DB
  const maxRow = await DB.prepare(
    `
    SELECT MAX(sort) as maxSort FROM playlist_song WHERE playlist_id = ?
  `,
  )
    .bind(playlistId)
    .first()
  const nextSort = (maxRow?.maxSort ?? -1) + 1
  try {
    await DB.prepare(
      `
      INSERT INTO playlist_song (playlist_id, song_id, sort) VALUES (?, ?, ?)
    `,
    )
      .bind(playlistId, id, nextSort)
      .run()
  } catch {
    return jsonResp({ code: 500, msg: '添加失败' })
  }
  return jsonResp({ code: 200, msg: '添加成功' })
}

/** 歌单歌曲排序 POST /api/playlist/sort-song：按数组顺序批量更新 sort */
async function handleSortPlaylistSongs(request, env) {
  const { playlistId, list } = await request.json()
  if (!playlistId || !Array.isArray(list)) return jsonResp({ code: 400, msg: '参数不全' })
  const DB = env.DB
  const stmt = DB.prepare(`UPDATE playlist_song SET sort = ? WHERE id = ? AND playlist_id = ?`)
  const batch = list.map((item, index) => stmt.bind(index + 1, item.id, playlistId))
  await DB.batch(batch)
  return jsonResp({ code: 200, msg: '排序已更新' })
}

/** 歌单歌曲降序 POST /api/playlist/demote-song：播放失败的歌曲移到歌单末尾 */
async function handleDemotePlaylistSong(request, env) {
  const { playlistId, id } = await request.json().catch(() => ({}))
  if (!playlistId || !id) return jsonResp({ code: 400, msg: '参数不全' })
  const DB = env.DB
  const row = await DB.prepare(
    'SELECT MAX(sort) AS maxSort FROM playlist_song WHERE playlist_id = ?',
  ).bind(playlistId).first()
  const nextSort = (Number(row?.maxSort) || 0) + 1
  await DB.prepare('UPDATE playlist_song SET sort = ? WHERE playlist_id = ? AND song_id = ?')
    .bind(nextSort, playlistId, id)
    .run()
  return jsonResp({ code: 200, msg: '已降到末尾' })
}

/** 歌单移除歌曲 POST /api/playlist/remove-song */
async function handleRemovePlaylistSong(request, env) {
  const { playlistId, id } = await request.json()
  if (!playlistId || !id) return jsonResp({ code: 500, msg: '参数不全' })
  const DB = env.DB
  await DB.prepare(`DELETE FROM playlist_song WHERE song_id=? AND playlist_id=?`)
    .bind(id, playlistId)
    .run()

  return jsonResp({ code: 200, msg: '已移除' })
}

/** 删除歌单 POST /api/playlist/delete：作者本人或管理员 */
async function handleDeletePlaylist(request, env) {
  const userId = getRequestUserId(request)
  const { id } = await request.json()
  if (!id) return jsonResp({ code: 400, msg: '缺少歌单id' })
  const DB = env.DB
  const adminId = await requireAdmin(request, env)
  if (adminId) {
    await DB.prepare(`DELETE FROM user_playlist WHERE id=?`).bind(id).run()
  } else {
    await DB.prepare(`DELETE FROM user_playlist WHERE id=? AND user_id=?`).bind(id, userId).run()
  }
  return jsonResp({ code: 200, msg: '歌单已删除' })
}
/** 取消收藏歌单 POST /api/subPlaylist/delete */
async function handleUnsubscribePlaylist(request, env) {
  const userId = getRequestUserId(request)
  const { id } = await request.json()
  if (!id) return jsonResp({ code: 400, msg: '缺少歌单id' })
  const DB = env.DB
  await DB.prepare(`DELETE FROM user_playlist_sub WHERE id=? AND user_id=?`).bind(id, userId).run()
  return jsonResp({ code: 200, msg: '歌单已删除' })
}

/** 发现歌单 GET /api/playlist/discover：按订阅人数倒序，最多返回 MAX_PLAYLIST_COUNT 条 */
async function handleGetDiscoverPlaylists(request, env) {
  const userId = getRequestUserId(request)
  const DB = env.DB
  const { results } = await DB.prepare(
    `
    SELECT
      p.*,
      COALESCE(sub.subscribe_count, 0) + 1 AS subscribe_count,
      CASE WHEN p.user_id = ? THEN 1 ELSE 0 END AS owner,
      (
        SELECT songs.cover_url
        FROM playlist_song ps
        LEFT JOIN songs ON ps.song_id = songs.id
        WHERE ps.playlist_id = p.id
        ORDER BY ps.sort
        LIMIT 1
      ) as pic,
      (
        SELECT COUNT(*)
        FROM playlist_song ps
        WHERE ps.playlist_id = p.id
      ) as count,
      u.nickname as nickname,
      u.avatar_url as avatar,
      u.vip_level as vip_level
    FROM user_playlist p
    LEFT JOIN (
      SELECT playlist_id, COUNT(*) AS subscribe_count
      FROM user_playlist_sub
      GROUP BY playlist_id
    ) sub ON p.id = sub.playlist_id
    LEFT JOIN users u ON u.id = p.user_id
    ORDER BY subscribe_count DESC, p.create_time DESC
    LIMIT ?
  `,
  )
    .bind(userId, MAX_PLAYLIST_COUNT)
    .all()
  results.forEach(item => (item.owner = Boolean(item.owner)))
  return jsonResp({ code: 200, msg: '获取发现歌单列表成功', data: results })
}

/** 搜索歌单 GET /api/playlist/search?keyword=xx：仅按歌单名称模糊匹配，最多返回 30 条 */
async function handleSearchPlaylists(request, env) {
  const userId = getRequestUserId(request)
  const keyword = (new URL(request.url).searchParams.get('keyword') || '').trim()
  if (!keyword) {
    return jsonResp({ code: 200, msg: '搜索歌单成功', data: [] })
  }
  const DB = env.DB
  const { results } = await DB.prepare(
    `
    SELECT
      p.*,
      COALESCE(sub.subscribe_count, 0) + 1 AS subscribe_count,
      CASE WHEN p.user_id = ? THEN 1 ELSE 0 END AS owner,
      (
        SELECT songs.cover_url
        FROM playlist_song ps
        LEFT JOIN songs ON ps.song_id = songs.id
        WHERE ps.playlist_id = p.id
        ORDER BY ps.sort
        LIMIT 1
      ) as pic,
      (
        SELECT COUNT(*)
        FROM playlist_song ps
        WHERE ps.playlist_id = p.id
      ) as count,
      u.nickname as nickname,
      u.avatar_url as avatar,
      u.vip_level as vip_level
    FROM user_playlist p
    LEFT JOIN (
      SELECT playlist_id, COUNT(*) AS subscribe_count
      FROM user_playlist_sub
      GROUP BY playlist_id
    ) sub ON p.id = sub.playlist_id
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.name LIKE ?
    ORDER BY subscribe_count DESC, p.create_time DESC
    LIMIT 30
  `,
  )
    .bind(userId, `%${keyword}%`)
    .all()
  results.forEach(item => (item.owner = Boolean(item.owner)))
  return jsonResp({ code: 200, msg: '搜索歌单成功', data: results })
}

/** 歌单信息 GET /api/playlist/info?id=xx：分享链接打开时使用，返回单条歌单信息 */
async function handleGetPlaylistInfo(request, env) {
  const userId = getRequestUserId(request)
  const id = Number(new URL(request.url).searchParams.get('id'))
  if (!id) {
    return jsonResp({ code: 400, msg: '歌单不存在' })
  }
  const DB = env.DB
  const { results } = await DB.prepare(
    `
    SELECT
      p.*,
      COALESCE(sub.subscribe_count, 0) + 1 AS subscribe_count,
      CASE WHEN p.user_id = ? THEN 1 ELSE 0 END AS owner,
      (
        SELECT songs.cover_url
        FROM playlist_song ps
        LEFT JOIN songs ON ps.song_id = songs.id
        WHERE ps.playlist_id = p.id
        ORDER BY ps.sort
        LIMIT 1
      ) as pic,
      (
        SELECT COUNT(*)
        FROM playlist_song ps
        WHERE ps.playlist_id = p.id
      ) as count,
      u.nickname as nickname,
      u.avatar_url as avatar,
      u.vip_level as vip_level
    FROM user_playlist p
    LEFT JOIN (
      SELECT playlist_id, COUNT(*) AS subscribe_count
      FROM user_playlist_sub
      GROUP BY playlist_id
    ) sub ON p.id = sub.playlist_id
    LEFT JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `,
  )
    .bind(userId, id)
    .all()
  const item = results[0]
  if (!item) {
    return jsonResp({ code: 404, msg: '歌单不存在' })
  }
  item.owner = Boolean(item.owner)
  return jsonResp({ code: 200, msg: '获取歌单信息成功', data: item })
}

/**
 * 分享 token：6 位 base62 短码
 * 前 4 位承载「id * 2 + 类型」，后 2 位是 HMAC 校验位
 * 校验位由 SECRET_KEY 派生，保证链接无法被随意枚举，同时长度保持简短
 */
const SHARE_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const SHARE_PAYLOAD_LEN = 4
const SHARE_SIG_LEN = 2
const SHARE_PAYLOAD_SPACE = 62 ** SHARE_PAYLOAD_LEN
const SHARE_SIG_SPACE = 62 ** SHARE_SIG_LEN
const SHARE_TOKEN_PATTERN = new RegExp(`^[0-9A-Z]{${SHARE_PAYLOAD_LEN + SHARE_SIG_LEN}}$`, 'i')

function encodeBase62(num, length) {
  let rest = num
  let result = ''
  while (rest > 0) {
    result = SHARE_ALPHABET[rest % 62] + result
    rest = Math.floor(rest / 62)
  }
  return result.padStart(length, '0')
}

async function getShareHmacKey() {
  // 与登录 token 共用 SECRET_KEY，加后缀做用途隔离
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${SECRET_KEY}:share`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

async function signSharePayload(key, payload) {
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  const bytes = new Uint8Array(signature)
  const num = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0
  return encodeBase62(num % SHARE_SIG_SPACE, SHARE_SIG_LEN)
}

async function createShareToken(type, id) {
  // 末位区分类型，song / playlist 互不通用
  const value = id * 2 + (type === 'playlist' ? 1 : 0)
  if (value <= 0 || value >= SHARE_PAYLOAD_SPACE)
    return null
  const payload = encodeBase62(value, SHARE_PAYLOAD_LEN)
  const key = await getShareHmacKey()
  return payload + (await signSharePayload(key, payload))
}

async function parseShareToken(token) {
  if (!token || !SHARE_TOKEN_PATTERN.test(token))
    return null
  const payload = token.slice(0, SHARE_PAYLOAD_LEN)
  const key = await getShareHmacKey()
  if ((await signSharePayload(key, payload)) !== token.slice(SHARE_PAYLOAD_LEN))
    return null
  let value = 0
  for (const char of payload) {
    const index = SHARE_ALPHABET.indexOf(char)
    if (index < 0)
      return null
    value = value * 62 + index
  }
  const id = Math.floor(value / 2)
  if (!id)
    return null
  return { type: value % 2 ? 'playlist' : 'song', id }
}

/** 生成分享 token GET /api/share/token?type=song&id=1 */
async function handleCreateShareToken(request) {
  const url = new URL(request.url)
  const type = url.searchParams.get('type')
  const id = Number(url.searchParams.get('id'))
  if ((type !== 'song' && type !== 'playlist') || !id) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }
  const token = await createShareToken(type, id)
  if (!token) {
    return jsonResp({ code: 400, msg: '分享 id 超出范围' })
  }
  return jsonResp({ code: 200, msg: '获取分享 token 成功', data: { token } })
}

/** 解析分享 token GET /api/share/resolve?token=xx */
async function handleResolveShareToken(request) {
  const token = new URL(request.url).searchParams.get('token') || ''
  const parsed = await parseShareToken(token)
  if (!parsed) {
    return jsonResp({ code: 400, msg: '分享链接无效或已失效' })
  }
  return jsonResp({ code: 200, msg: '解析分享 token 成功', data: parsed })
}

/**
 * 分享人数统计表（需手动执行建表 SQL）：
 * 歌曲与歌单共用一张表，target_type 区分 song / playlist，
 * 按 (类型, id, user_id) 去重，一个用户分享同一条内容只算一人
 */

/** 查询歌曲分享人数 GET /api/song/share?id=1 */
async function handleGetSongShareCount(request, env) {
  const id = Number(new URL(request.url).searchParams.get('id'))
  if (!id) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM share_user WHERE target_type = \'song\' AND target_id = ?').bind(id).first()
  return jsonResp({ code: 200, msg: '获取分享人数成功', data: { count: row?.count || 0 } })
}

/** 记录一次分享 POST /api/song/share { id }：返回最新分享人数 */
async function handleReportSongShare(request, env) {
  const userId = getRequestUserId(request)
  const body = await request.json().catch(() => ({}))
  const id = Number(body && body.id)
  if (!id) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }
  await env.DB.prepare('INSERT OR IGNORE INTO share_user (target_type, target_id, user_id, create_time) VALUES (\'song\', ?, ?, DATETIME(\'now\'))')
    .bind(id, String(userId))
    .run()
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM share_user WHERE target_type = \'song\' AND target_id = ?').bind(id).first()
  return jsonResp({ code: 200, msg: '分享记录成功', data: { count: row?.count || 0 } })
}

/** 查询歌单分享人数 GET /api/playlist/share?id=1 */
async function handleGetPlaylistShareCount(request, env) {
  const id = Number(new URL(request.url).searchParams.get('id'))
  if (!id) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM share_user WHERE target_type = \'playlist\' AND target_id = ?').bind(id).first()
  return jsonResp({ code: 200, msg: '获取分享人数成功', data: { count: row?.count || 0 } })
}

/** 记录一次歌单分享 POST /api/playlist/share { id }：返回最新分享人数 */
async function handleReportPlaylistShare(request, env) {
  const userId = getRequestUserId(request)
  const body = await request.json().catch(() => ({}))
  const id = Number(body && body.id)
  if (!id) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }
  await env.DB.prepare('INSERT OR IGNORE INTO share_user (target_type, target_id, user_id, create_time) VALUES (\'playlist\', ?, ?, DATETIME(\'now\'))')
    .bind(id, String(userId))
    .run()
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM share_user WHERE target_type = \'playlist\' AND target_id = ?').bind(id).first()
  return jsonResp({ code: 200, msg: '分享记录成功', data: { count: row?.count || 0 } })
}

/**
 * 歌曲评论表（需手动执行建表 SQL）：
 * 回复统一挂在顶层评论下（parent_id 指向顶层），只保留一层结构
 */
const COMMENT_MAX_LENGTH = 500
const COMMENT_PAGE_SIZE = 20

/** 数据库时间值 → 毫秒时间戳：兼容纯数字时间戳与 'YYYY-MM-DD HH:MM:SS'（UTC） */
function toEpochMs(value) {
  if (value == null || value === '')
    return 0
  if (typeof value === 'number')
    return value
  const str = String(value).trim()
  if (/^\d+$/.test(str))
    return Number(str)
  const ms = Date.parse(`${str.replace(' ', 'T')}Z`)
  return Number.isFinite(ms) ? ms : 0
}

function mapCommentRow(row, liked, currentUserId) {
  return {
    id: row.id,
    songId: row.song_id,
    userId: row.user_id,
    nickname: row.nickname || '',
    avatar: row.avatar || '',
    vipLevel: Number(row.vip_level) || 0,
    content: row.content,
    parentId: row.parent_id,
    likeCount: row.like_count,
    replyCount: row.reply_count || 0,
    liked: !!liked,
    mine: String(row.user_id) === String(currentUserId || ''),
    createTime: toEpochMs(row.create_time),
  }
}

/** 评论列表 GET /api/song/comment?songId=&parentId=&sort=default|latest&page=&pageSize= */
async function handleGetComments(request, env) {
  const userId = String(getRequestUserId(request) || '')
  const url = new URL(request.url)
  const songId = Number(url.searchParams.get('songId'))
  const parentId = Number(url.searchParams.get('parentId') || 0)
  const sort = url.searchParams.get('sort') === 'latest' ? 'latest' : 'default'
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('pageSize')) || COMMENT_PAGE_SIZE))
  if (!songId) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }

  const where = parentId ? 'c.song_id = ? AND c.parent_id = ?' : 'c.song_id = ? AND c.parent_id = 0'
  const whereParams = parentId ? [songId, parentId] : [songId]
  const order = sort === 'latest' ? 'c.create_time DESC' : 'c.like_count DESC, c.create_time DESC'
  const sql = `SELECT c.*,
      u.nickname AS nickname,
      u.avatar_url AS avatar,
      u.vip_level AS vip_level,
      (SELECT COUNT(*) FROM song_comment r WHERE r.parent_id = c.id) AS reply_count,
      EXISTS(SELECT 1 FROM song_comment_like l WHERE l.comment_id = c.id AND l.user_id = ?) AS liked
    FROM song_comment c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ? OFFSET ?`
  const { results } = await env.DB.prepare(sql)
    .bind(userId, ...whereParams, pageSize, (page - 1) * pageSize)
    .all()
  return jsonResp({
    code: 200,
    msg: '获取评论成功',
    data: (results || []).map(row => mapCommentRow(row, row.liked, userId)),
  })
}

/** 评论总数 GET /api/song/comment/count?songId=1（含回复） */
async function handleGetCommentCount(request, env) {
  const songId = Number(new URL(request.url).searchParams.get('songId'))
  if (!songId) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM song_comment WHERE song_id = ?').bind(songId).first()
  return jsonResp({ code: 200, msg: '获取评论数成功', data: { count: row?.count || 0 } })
}

/** 发布评论 POST /api/song/comment { songId, content, parentId? } */
async function handleAddComment(request, env) {
  const userId = getRequestUserId(request)
  if (!userId) {
    return jsonResp({ code: 401, msg: '登录后才能评论' }, 401)
  }
  const body = await request.json().catch(() => ({}))
  const songId = Number(body.songId)
  const content = String(body.content || '').trim()
  let parentId = Number(body.parentId) || 0
  if (!songId || !content) {
    return jsonResp({ code: 400, msg: '评论内容不能为空' })
  }
  if (content.length > COMMENT_MAX_LENGTH) {
    return jsonResp({ code: 400, msg: `评论最多 ${COMMENT_MAX_LENGTH} 字` })
  }
  if (parentId) {
    const parent = await env.DB.prepare('SELECT id, song_id, parent_id FROM song_comment WHERE id = ?').bind(parentId).first()
    if (!parent || parent.song_id !== songId) {
      return jsonResp({ code: 400, msg: '回复的评论不存在' })
    }
    // 二级回复归到顶层，保持一层结构
    parentId = parent.parent_id || parentId
  }

  const now = Date.now()
  const result = await env.DB.prepare(
    `INSERT INTO song_comment (song_id, user_id, content, parent_id, like_count, create_time)
     VALUES (?, ?, ?, ?, 0, DATETIME('now'))`,
  ).bind(songId, String(userId), content, parentId).run()
  const identity = await getUserIdentity(env, userId)
  return jsonResp({
    code: 200,
    msg: '评论成功',
    data: {
      id: result.meta?.last_row_id,
      songId,
      userId: String(userId),
      nickname: identity.nickname,
      avatar: identity.avatar,
      vipLevel: identity.vipLevel,
      content,
      parentId,
      likeCount: 0,
      replyCount: 0,
      liked: false,
      mine: true,
      createTime: now,
    },
  })
}

/** 点赞 / 取消点赞 POST /api/song/comment/like { id } */
async function handleToggleCommentLike(request, env) {
  const userId = getRequestUserId(request)
  if (!userId) {
    return jsonResp({ code: 401, msg: '登录后才能点赞' }, 401)
  }
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id)
  if (!id) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }
  const comment = await env.DB.prepare('SELECT id FROM song_comment WHERE id = ?').bind(id).first()
  if (!comment) {
    return jsonResp({ code: 404, msg: '评论不存在' }, 404)
  }

  const likedRow = await env.DB.prepare('SELECT 1 AS liked FROM song_comment_like WHERE comment_id = ? AND user_id = ?')
    .bind(id, String(userId))
    .first()
  if (likedRow) {
    await env.DB.prepare('DELETE FROM song_comment_like WHERE comment_id = ? AND user_id = ?').bind(id, String(userId)).run()
  } else {
    await env.DB.prepare('INSERT OR IGNORE INTO song_comment_like (comment_id, user_id) VALUES (?, ?)').bind(id, String(userId)).run()
  }

  const countRow = await env.DB.prepare('SELECT COUNT(*) AS count FROM song_comment_like WHERE comment_id = ?').bind(id).first()
  const likeCount = countRow?.count || 0
  // 同步冗余计数，供「默认」排序使用
  await env.DB.prepare('UPDATE song_comment SET like_count = ? WHERE id = ?').bind(likeCount, id).run()
  return jsonResp({ code: 200, msg: '操作成功', data: { liked: !likedRow, likeCount } })
}

/** 删除评论 POST /api/song/comment/delete { id }：作者本人或管理员，连同其回复一并删除 */
async function handleDeleteComment(request, env) {
  const userId = getRequestUserId(request)
  if (!userId) {
    return jsonResp({ code: 401, msg: '登录后才能删除评论' }, 401)
  }
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id)
  if (!id) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }
  const comment = await env.DB.prepare('SELECT id, user_id FROM song_comment WHERE id = ?').bind(id).first()
  if (!comment) {
    return jsonResp({ code: 404, msg: '评论不存在' }, 404)
  }
  const isAuthor = String(comment.user_id) === String(userId)
  if (!isAuthor && !(await requireAdmin(request, env))) {
    return jsonResp({ code: 403, msg: '只能删除自己的评论' }, 403)
  }

  // 先清理点赞记录（含子回复），再删评论与回复
  await env.DB.prepare(
    'DELETE FROM song_comment_like WHERE comment_id = ? OR comment_id IN (SELECT id FROM song_comment WHERE parent_id = ?)',
  ).bind(id, id).run()
  const result = await env.DB.prepare('DELETE FROM song_comment WHERE id = ? OR parent_id = ?').bind(id, id).run()
  return jsonResp({ code: 200, msg: '删除成功', data: { count: result.meta?.changes || 0 } })
}

/** 歌曲详情 GET /api/song/detail?id=xx：返回统一 Song 字段 + 收藏状态 */
async function handleGetSongDetail(request, env) {
  const userId = getRequestUserId(request)
  const url = new URL(request.url)
  const id = url.searchParams.get('id') || ''
  if (!id) {
    return jsonResp({ code: 400, msg: '资源不存在' })
  }
  const DB = env.DB
  const results = await DB.prepare(
    `
    SELECT
      s.*,
      CASE WHEN f.user_id IS NOT NULL THEN 1 ELSE 0 END AS favorite,
      (SELECT COUNT(*) FROM user_favorite fv WHERE fv.song_id = s.id) AS favorite_count
    FROM songs s
    LEFT JOIN user_favorite f ON f.user_id = ? AND f.song_id = s.id
    WHERE s.id = ?
  `,
  )
    .bind(userId, id)
    .first()
  if (!results) {
    return jsonResp({ code: 404, msg: '歌曲不存在' })
  }
  return jsonResp({ code: 200, msg: '请求成功', data: mapSongRow(results, { withLyric: true, withFavorite: true }) })
}

/** 主题色结果缓存（Workers isolate 级别，避免重复下载解码封面） */
const themeColorCache = new Map()
const FALLBACK_PALETTE = ['#7a3b3b', '#3b5a7a', '#4c3b7a', '#7a6a3b', '#3b7a5a', '#7a3b6a']

/**
 * 上报歌曲缺失元信息 POST /api/song/meta
 * body: { id, duration?, themeColor? }
 *  - duration：只在库里为空/0 时补写，不覆盖上游更准确的数据
 *  - themeColor：写入 songs.theme_color
 */
async function handleUpdateSongMeta(request, env) {
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
async function handleGetSongThemeColor(request, env) {
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
async function extractThemeColor(picUrl) {
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
async function decodePngAverageColor(buffer) {
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
async function inflateZlib(data) {
  const stream = new Response(data).body.pipeThrough(new DecompressionStream('deflate'))
  const out = await new Response(stream).arrayBuffer()
  return new Uint8Array(out)
}

/** 读取大端 32 位无符号整数（PNG 块长度 / 宽高等） */
function readUint32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

/** 字符串哈希：把封面地址稳定映射到兜底调色板下标 */
function hashSeed(text) {
  let hash = 0
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  return hash
}

/** RGB 转 #rrggbb（分量自动夹到 0-255） */
function rgbToHex(r, g, b) {
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`
}

/** #rrggbb 转 [r, g, b]；非法输入返回黑色 */
function hexToRgb(hex) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return match ? [Number.parseInt(match[1], 16), Number.parseInt(match[2], 16), Number.parseInt(match[3], 16)] : [0, 0, 0]
}

/** 四舍五入并夹到 0-255 的整数 */
function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)))
}

// ===================== JPEG 平均色 =====================

/**
 * 完全自研的 JPEG 平均色提取：
 * DCT 的 DC 系数就是 8×8 块的均值，因此不需要反量化 + IDCT 逐像素渲染，
 * 只要按 Huffman 表把每个块的 DC 解出来加权平均，即可得到整图平均色。
 * 支持基线（SOF0/SOF1）与渐进式（SOF2）；渐进式只解 DC 首扫，其余扫描按字节跳过。
 */
function decodeJpegAverageColor(data) {
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
function decodeScan(data, scan, frame, quant, huffDC, huffAC, restartInterval, sums, counts) {
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
function decodeBlock(reader, entry, useAC, al, quant, huffDC, huffAC, predictors, sums, counts) {
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
function createBitReader(data, start) {
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
function parseScanHeader(data, pos) {
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
function parseDqt(data, start, end, quant) {
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
function parseDht(data, start, end, huffDC, huffAC) {
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
function parseSof(data, start, end, progressive) {
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
function parseAdobeTransform(data, start, end) {
  if (end - start < 12) return -1
  const tag = String.fromCharCode(data[start], data[start + 1], data[start + 2], data[start + 3], data[start + 4])
  return tag === 'Adobe' ? data[start + 11] : -1
}

/** 按码长分布构建规范 Huffman 表：数组下标为码长，内部 Map 为 code → symbol */
function buildHuffmanTable(counts, symbols) {
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
function decodeHuffman(reader, table) {
  let code = 0
  for (let len = 1; len <= 16; len++) {
    code = (code << 1) | reader.readBit()
    const symbol = table[len].get(code)
    if (symbol !== undefined) return symbol
  }
  throw new Error('Huffman 解码失败')
}

/** JPEG 幅值扩展：把 size 位无符号值还原成有符号差分 */
function extendValue(value, size) {
  return value < 1 << (size - 1) ? value - (1 << size) + 1 : value
}

/** 字节级跳过熵编码段，直到下一个真实 marker（跳过 0xFF00 与 RSTn） */
function skipEntropy(data, start) {
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
function readU16(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1]
}

// ==================== 心愿墙 ====================
/** 心愿墙：wish / wish_like / wish_message 三张表由人工建表；只展示最近 30 天的心愿 */
const WISH_RECENT_DAYS = 30
const WISH_MAX_LENGTH = 100
const WISH_MESSAGE_MAX_LENGTH = 200
const WISH_LIST_LIMIT = 120

/** 读取用户展示信息（昵称 + 头像 + VIP 等级），用于心愿/评论/歌单等场景 */
async function getUserIdentity(env, userId) {
  if (!userId)
    return { nickname: '', avatar: '', vipLevel: 0 }
  const row = await env.DB.prepare('SELECT nickname, avatar_url, vip_level FROM users WHERE id = ?')
    .bind(userId)
    .first()
  return { nickname: row?.nickname || '', avatar: row?.avatar_url || '', vipLevel: Number(row?.vip_level) || 0 }
}

/** 心愿行 → 前端结构 */
function mapWishRow(row, userId) {
  return {
    id: row.id,
    userId: String(row.user_id),
    nickname: row.nickname || '',
    avatar: row.avatar || '',
    vipLevel: Number(row.vip_level) || 0,
    content: row.content,
    likeCount: Number(row.like_count) || 0,
    messageCount: Number(row.message_count) || 0,
    liked: !!row.liked,
    mine: String(row.user_id) === String(userId || ''),
    createTime: toEpochMs(row.create_time),
  }
}

/** 留言行 → 前端结构 */
function mapWishMessageRow(row, userId) {
  return {
    id: row.id,
    wishId: row.wish_id,
    userId: String(row.user_id),
    nickname: row.nickname || '',
    avatar: row.avatar || '',
    vipLevel: Number(row.vip_level) || 0,
    content: row.content,
    mine: String(row.user_id) === String(userId || ''),
    createTime: toEpochMs(row.create_time),
  }
}

/** 心愿列表 GET /api/wish/list：仅最近 30 天，按点赞数倒序（前端自行取 Top3 + 其余轮动） */
async function handleGetWishes(request, env) {
  const userId = String(getRequestUserId(request) || '')
  const { results } = await env.DB.prepare(
    `SELECT w.*,
      u.nickname AS nickname,
      u.avatar_url AS avatar,
      u.vip_level AS vip_level,
      (SELECT COUNT(*) FROM wish_message m WHERE m.wish_id = w.id) AS message_count,
      EXISTS(SELECT 1 FROM wish_like l WHERE l.wish_id = w.id AND l.user_id = ?) AS liked
    FROM wish w
    LEFT JOIN users u ON u.id = w.user_id
    WHERE w.create_time >= DATETIME('now', '-${WISH_RECENT_DAYS} day')
    ORDER BY w.like_count DESC, w.create_time DESC
    LIMIT ?`,
  ).bind(userId, WISH_LIST_LIMIT).all()
  return jsonResp({
    code: 200,
    msg: '获取心愿成功',
    data: (results || []).map(row => mapWishRow(row, userId)),
  })
}

/** 发表心愿 POST /api/wish/add { content } */
async function handleAddWish(request, env) {
  const userId = getRequestUserId(request)
  if (!userId) {
    return jsonResp({ code: 401, msg: '登录后才能许愿' }, 401)
  }
  // 每周只能许一个心愿
  const recentWish = await env.DB.prepare(
    `SELECT create_time FROM wish
     WHERE user_id = ? AND create_time >= DATETIME('now', '-7 day')
     ORDER BY create_time DESC LIMIT 1`,
  ).bind(String(userId)).first()
  if (recentWish) {
    return jsonResp({ code: 400, msg: '本周心愿已经挂上墙啦，下周再来许愿吧' })
  }
  const body = await request.json().catch(() => ({}))
  const content = String(body.content || '').trim()
  if (!content) {
    return jsonResp({ code: 400, msg: '心愿内容不能为空' })
  }
  if (content.length > WISH_MAX_LENGTH) {
    return jsonResp({ code: 400, msg: `心愿最多 ${WISH_MAX_LENGTH} 字` })
  }

  const now = Date.now()
  const result = await env.DB.prepare(
    `INSERT INTO wish (user_id, content, like_count, create_time)
     VALUES (?, ?, 0, DATETIME('now'))`,
  ).bind(String(userId), content).run()
  const identity = await getUserIdentity(env, userId)
  return jsonResp({
    code: 200,
    msg: '许愿成功',
    data: {
      id: result.meta?.last_row_id,
      userId: String(userId),
      nickname: identity.nickname,
      avatar: identity.avatar,
      vipLevel: identity.vipLevel,
      content,
      likeCount: 0,
      messageCount: 0,
      liked: false,
      mine: true,
      createTime: now,
    },
  })
}

/** 心愿点赞 / 取消点赞 POST /api/wish/like { id } */
async function handleToggleWishLike(request, env) {
  const userId = getRequestUserId(request)
  if (!userId) {
    return jsonResp({ code: 401, msg: '登录后才能点赞' }, 401)
  }
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id)
  if (!id) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }
  const wish = await env.DB.prepare('SELECT id FROM wish WHERE id = ?').bind(id).first()
  if (!wish) {
    return jsonResp({ code: 404, msg: '心愿不存在' }, 404)
  }

  const likedRow = await env.DB.prepare('SELECT 1 AS liked FROM wish_like WHERE wish_id = ? AND user_id = ?')
    .bind(id, String(userId))
    .first()
  if (likedRow) {
    await env.DB.prepare('DELETE FROM wish_like WHERE wish_id = ? AND user_id = ?').bind(id, String(userId)).run()
  } else {
    await env.DB.prepare('INSERT OR IGNORE INTO wish_like (wish_id, user_id, create_time) VALUES (?, ?, DATETIME(\'now\'))')
      .bind(id, String(userId))
      .run()
  }

  const countRow = await env.DB.prepare('SELECT COUNT(*) AS count FROM wish_like WHERE wish_id = ?').bind(id).first()
  const likeCount = countRow?.count || 0
  // 同步冗余计数，列表按 like_count 排序
  await env.DB.prepare('UPDATE wish SET like_count = ? WHERE id = ?').bind(likeCount, id).run()
  return jsonResp({ code: 200, msg: '操作成功', data: { liked: !likedRow, likeCount } })
}

/** 心愿留言列表 GET /api/wish/messages?wishId=1 */
async function handleGetWishMessages(request, env) {
  const userId = String(getRequestUserId(request) || '')
  const wishId = Number(new URL(request.url).searchParams.get('wishId'))
  if (!wishId) {
    return jsonResp({ code: 400, msg: '参数错误' })
  }
  const { results } = await env.DB.prepare(
    `SELECT m.*,
      u.nickname AS nickname,
      u.avatar_url AS avatar,
      u.vip_level AS vip_level
    FROM wish_message m
    LEFT JOIN users u ON u.id = m.user_id
    WHERE m.wish_id = ?
    ORDER BY m.create_time ASC
    LIMIT 200`,
  ).bind(wishId).all()
  return jsonResp({
    code: 200,
    msg: '获取留言成功',
    data: (results || []).map(row => mapWishMessageRow(row, userId)),
  })
}

/** 给心愿留言 POST /api/wish/message/add { wishId, content } */
async function handleAddWishMessage(request, env) {
  const userId = getRequestUserId(request)
  if (!userId) {
    return jsonResp({ code: 401, msg: '登录后才能留言' }, 401)
  }
  const body = await request.json().catch(() => ({}))
  const wishId = Number(body.wishId)
  const content = String(body.content || '').trim()
  if (!wishId || !content) {
    return jsonResp({ code: 400, msg: '留言内容不能为空' })
  }
  if (content.length > WISH_MESSAGE_MAX_LENGTH) {
    return jsonResp({ code: 400, msg: `留言最多 ${WISH_MESSAGE_MAX_LENGTH} 字` })
  }
  const wish = await env.DB.prepare('SELECT id FROM wish WHERE id = ?').bind(wishId).first()
  if (!wish) {
    return jsonResp({ code: 404, msg: '心愿不存在' }, 404)
  }

  const now = Date.now()
  const result = await env.DB.prepare(
    `INSERT INTO wish_message (wish_id, user_id, content, create_time)
     VALUES (?, ?, ?, DATETIME('now'))`,
  ).bind(wishId, String(userId), content).run()
  const countRow = await env.DB.prepare('SELECT COUNT(*) AS count FROM wish_message WHERE wish_id = ?').bind(wishId).first()
  const identity = await getUserIdentity(env, userId)
  return jsonResp({
    code: 200,
    msg: '留言成功',
    data: {
      id: result.meta?.last_row_id,
      wishId,
      userId: String(userId),
      nickname: identity.nickname,
      avatar: identity.avatar,
      vipLevel: identity.vipLevel,
      content,
      mine: true,
      createTime: now,
      messageCount: countRow?.count || 0,
    },
  })
}

/** 管理员删除心愿 POST /api/wish/delete { id }：连同点赞与留言一并删除 */
async function handleDeleteWish(request, env) {
  const adminId = await requireAdmin(request, env)
  if (!adminId)
    return jsonResp({ code: 403, msg: '无管理员权限' }, 403)
  const body = await request.json().catch(() => ({}))
  const id = Number(body.id)
  if (!id)
    return jsonResp({ code: 400, msg: '参数错误' })
  const DB = env.DB
  const wish = await DB.prepare('SELECT id FROM wish WHERE id = ?').bind(id).first()
  if (!wish)
    return jsonResp({ code: 404, msg: '心愿不存在' }, 404)
  await DB.prepare('DELETE FROM wish_like WHERE wish_id = ?').bind(id).run()
  await DB.prepare('DELETE FROM wish_message WHERE wish_id = ?').bind(id).run()
  await DB.prepare('DELETE FROM wish WHERE id = ?').bind(id).run()
  return jsonResp({ code: 200, msg: '心愿已删除' })
}
