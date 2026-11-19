-- =============================================================
-- ani-music 站内消息通知表
-- 在 Cloudflare D1 控制台或 wrangler d1 execute 中执行
-- =============================================================

-- 别人回复了你的评论、或在你的心愿下留言时，写入一条通知
CREATE TABLE IF NOT EXISTS user_notification (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,                 -- 接收者 users.id（与 song_comment / wish 的 user_id 保持一致，用文本存）
  type TEXT NOT NULL,                    -- comment_reply 评论回复 / wish_message 心愿留言
  sender_id TEXT NOT NULL DEFAULT '',    -- 触发者 users.id
  sender_name TEXT NOT NULL DEFAULT '',  -- 触发时昵称快照，用户改名后以 users 表为准
  content TEXT NOT NULL DEFAULT '',      -- 回复 / 留言内容
  target_id INTEGER NOT NULL DEFAULT 0,  -- 目标 id：type=comment_reply 时为 song_id，wish_message 时为 wish_id
  target_title TEXT NOT NULL DEFAULT '', -- 目标标题：歌曲名 / 心愿内容摘要
  ref_id INTEGER NOT NULL DEFAULT 0,     -- 关联 id：被回复的评论 id / 留言 id
  is_read INTEGER NOT NULL DEFAULT 0,    -- 0 未读 / 1 已读
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP -- 创建时间（UTC）
);

CREATE INDEX IF NOT EXISTS idx_notification_user ON user_notification(user_id, id);
CREATE INDEX IF NOT EXISTS idx_notification_unread ON user_notification(user_id, is_read);
