import { applyEnvOverrides, headers } from './config.js'
import {
  findIpBan,
  getClientIp,
  getUserIdFromToken,
  isAllowedReferer,
  isHumanRequest,
  isUserAlive,
  requestUserIds,
} from './auth.js'
import { deleteUserCascade } from './db.js'
import { jsonResp } from './http.js'
import { PUBLIC_PATHS, ROUTES } from './router.js'

export default {
  /**
   * Worker 入口：先做爬虫与来源校验、token 校验，再按 path + method 分发到各业务方法
   */
  async fetch(request, env, ctx) {
    // 允许用环境变量覆盖敏感常量（未配置时使用内置默认值）
    applyEnvOverrides(env)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers })
    }
    if (!isHumanRequest(request)) return jsonResp({ code: 403, msg: '禁止爬虫访问' }, 403)
    if (!isAllowedReferer(request)) return jsonResp({ code: 403, msg: '非法请求来源' }, 403)

    // IP 黑名单拦截：命中的 IP 在解封前无法使用任何接口（含登录）
    try {
      const ipBan = await findIpBan(env, getClientIp(request))
      if (ipBan) {
        return jsonResp({
          code: 403,
          msg: `该 IP 已被限制访问${ipBan.expire_time ? `（至 ${String(ipBan.expire_time).slice(0, 16)}）` : '（永久）'}`,
          data: { ip: ipBan.ip, reason: ipBan.reason || '' },
        }, 403)
      }
    } catch (e) {
      console.warn('[ip-blacklist] 检查失败', e)
    }

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
        AND NOT EXISTS (SELECT 1 FROM song_tag t WHERE t.user_id = u.id)
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
