import { formatBanUntil, generateToken, getClientIp, getUserIdFromToken, isBanActive, requireActiveUser } from './auth.js'
import { APP_CONFIG } from './config.js'
import { jsonResp } from './http.js'

/**
 * 自动登录 POST /api/user/auto
 * 优先复用请求携带的有效 token，其次按 IP + 指纹匹配老用户，最后才新建用户
 */
export async function handleAutoLogin(request, env) {
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
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** users 行 → 前端用户信息（头像以 base64 / data URL 形式原样下发） */
export function mapUserProfile(row) {
  return {
    id: row.id,
    username: row.username || '',
    nickname: row.nickname || '',
    avatar: row.avatar_url || '',
    isAdmin: !!row.is_admin,
    /** VIP 等级：0 非会员，1+ 永久 VIP 等级 */
    vipLevel: Number(row.vip_level) || 0,
    /** 账号状态：active 正常 / banned 已封禁 */
    status: row.status || 'active',
  }
}

/**
 * 记录最近登录时间到 users.last_login（DATETIME，UTC）
 * 表结构缺少该列时只打日志，不影响登录流程
 */
export async function touchLastLogin(env, userId) {
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
export async function handleUserLogin(request, env) {
  const body = await request.json().catch(() => ({}))
  const account = String(body.account || body.username || '').trim()
  const password = String(body.password || '')
  if (!account || !password) {
    return jsonResp({ code: 400, msg: '请输入账号和密码' })
  }
  const { results } = await env.DB.prepare(
    `SELECT id, username, password, nickname, avatar_url, is_admin, vip_level,
            COALESCE(status, 'active') AS status, ban_reason, ban_until
     FROM users
     WHERE username = ? OR (phone IS NOT NULL AND phone != '' AND phone = ?)
        OR (email IS NOT NULL AND email != '' AND email = ?)
     ORDER BY id ASC`,
  )
    .bind(account, account, account)
    .all()
  const hashed = await sha256Hex(password + APP_CONFIG.secretKey)
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
          banned: row.status === 'banned' && isBanActive(row.ban_until),
        })),
      },
    })
  }
  const row = matched[0]
  if (row.status === 'banned' && isBanActive(row.ban_until)) {
    return jsonResp({
      code: 403,
      msg: `账号已被封禁${formatBanUntil(row.ban_until)}`,
      data: { reason: row.ban_reason || '', banUntil: row.ban_until || '' },
    }, 403)
  }
  // 限时封禁已到期：登录时顺手恢复状态
  if (row.status === 'banned') {
    await env.DB.prepare(
      `UPDATE users SET status = 'active', ban_reason = '', ban_until = NULL WHERE id = ?`,
    ).bind(row.id).run()
  }
  await touchLastLogin(env, row.id)
  // 登录时写 KV 记录 IP（登录走 PUBLIC_PATHS，index.js 里那步不执行）
  try {
    const ip = getClientIp(request)
    if (ip && env.HOT_KV)
      env.HOT_KV.put(`user_ip:${row.id}`, ip, { expirationTtl: 2_592_000 })
  } catch {}
  return jsonResp({
    code: 200,
    msg: '登录成功',
    data: { token: await generateToken(row.id), user: mapUserProfile(row) },
  })
}

/** 当前登录用户信息 GET /api/user/profile */
export async function handleGetUserProfile(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
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
export async function handleUpdateUserProfile(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
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
 * 他人公开资料 GET /api/user/public-profile?id=xx
 * 只返回可公开的信息与互动统计，不包含手机号 / 邮箱 / 密码
 */
export async function handleGetPublicUserProfile(request, env) {
  const { userId: currentUserId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const targetId = Number(new URL(request.url).searchParams.get('id'))
  if (!targetId)
    return jsonResp({ code: 400, msg: '参数错误' })

  const row = await env.DB.prepare(
    `SELECT id, nickname, avatar_url, vip_level, is_admin,
            COALESCE(status, 'active') AS status
     FROM users WHERE id = ?`,
  )
    .bind(targetId)
    .first()
  if (!row?.id)
    return jsonResp({ code: 404, msg: '用户不存在' }, 404)

  // 评论 / 心愿的 user_id 以文本存储，歌单为数字
  const [commentRow, wishRow, playlistRow] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS count FROM song_comment WHERE user_id = ?').bind(String(targetId)).first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM wish WHERE user_id = ?').bind(String(targetId)).first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM user_playlist WHERE user_id = ?').bind(targetId).first(),
  ])

  return jsonResp({
    code: 200,
    msg: '获取成功',
    data: {
      id: row.id,
      nickname: row.nickname || '',
      avatar: row.avatar_url || '',
      vipLevel: Number(row.vip_level) || 0,
      isAdmin: !!row.is_admin,
      status: row.status || 'active',
      mine: row.id === currentUserId,
      commentCount: Number(commentRow?.count) || 0,
      wishCount: Number(wishRow?.count) || 0,
      playlistCount: Number(playlistRow?.count) || 0,
    },
  })
}

/** 给其他用户留言的最大长度 */
export async function handleChangePassword(request, env) {
  const { userId, errResp } = await requireActiveUser(request, env)
  if (errResp) return errResp
  const body = await request.json().catch(() => ({}))
  const oldPassword = String(body.oldPassword || '')
  const newPassword = String(body.newPassword || '')
  if (!oldPassword || !newPassword)
    return jsonResp({ code: 400, msg: '请输入原密码和新密码' })
  if (newPassword.length < 6 || newPassword.length > 64)
    return jsonResp({ code: 400, msg: '新密码需 6-64 个字符' })
  if (oldPassword === newPassword)
    return jsonResp({ code: 400, msg: '新密码不能与原密码相同' })

  const row = await env.DB.prepare('SELECT id, password FROM users WHERE id = ?').bind(userId).first()
  if (!row?.id)
    return jsonResp({ code: 401, msg: '账号不存在' }, 401)
  if (!row.password)
    return jsonResp({ code: 400, msg: '当前账号未设置密码，无法修改' })
  const oldHashed = await sha256Hex(oldPassword + APP_CONFIG.secretKey)
  if (row.password !== oldHashed)
    return jsonResp({ code: 400, msg: '原密码错误' })

  const newHashed = await sha256Hex(newPassword + APP_CONFIG.secretKey)
  await env.DB.prepare('UPDATE users SET password = ? WHERE id = ?').bind(newHashed, userId).run()
  return jsonResp({ code: 200, msg: '密码已修改', data: null })
}

/**
 * 会员注册申请 POST /api/user/register
 * 必填：用户名、昵称、密码、付款截图；选填：手机号、邮箱
 * 提交后进入 registration_request 待审批，管理员通过后才写入 users 生效
 */
export async function handleRegister(request, env) {
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

  const hashed = await sha256Hex(password + APP_CONFIG.secretKey)
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
export async function handleRegisterStatus(request, env) {
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
