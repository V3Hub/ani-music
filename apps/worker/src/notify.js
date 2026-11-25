export async function pushNotification(DB, payload) {
  try {
    await DB.prepare(
      `INSERT INTO user_notification
        (user_id, type, sender_id, sender_name, content, target_id, target_title, ref_id, create_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATETIME('now'))`,
    ).bind(
      String(payload.userId),
      payload.type,
      String(payload.senderId || ''),
      payload.senderName || '',
      payload.content || '',
      Number(payload.targetId) || 0,
      payload.targetTitle || '',
      Number(payload.refId) || 0,
    ).run()
  } catch (e) {
    console.warn('[notification] 写入失败，请确认已执行 user_notification 建表 SQL', e)
  }
}

/** 清理通知：表未建时静默跳过，避免影响评论 / 心愿 / 账号删除 */
export async function clearNotifications(DB, { sql, params = [] }) {
  try {
    await DB.prepare(sql).bind(...params).run()
  } catch (e) {
    console.warn('[notification] 清理失败，请确认已执行 user_notification 建表 SQL', e)
  }
}

/** 通知行 → 前端结构：发送者昵称 / 头像取 users 表最新值，取不到时用写入时的快照 */
