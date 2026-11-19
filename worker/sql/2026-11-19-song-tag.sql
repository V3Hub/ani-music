-- =============================================================
-- ani-music 歌曲标签表
-- 在 Cloudflare D1 控制台或 wrangler d1 execute 中执行
-- =============================================================

-- 用户给歌曲打的标签；同一用户对同一首歌的同一标签只保留一条
CREATE TABLE IF NOT EXISTS song_tag (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER NOT NULL,              -- songs.id
  tag TEXT NOT NULL,                     -- 标签文本
  user_id INTEGER NOT NULL,              -- 打标签的 users.id
  create_time DATETIME DEFAULT (DATETIME('now')) -- 创建时间（UTC）
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_song_tag ON song_tag(song_id, tag, user_id);
CREATE INDEX IF NOT EXISTS idx_song_tag_song ON song_tag(song_id);
CREATE INDEX IF NOT EXISTS idx_song_tag_tag ON song_tag(tag);
CREATE INDEX IF NOT EXISTS idx_song_tag_user ON song_tag(user_id);
