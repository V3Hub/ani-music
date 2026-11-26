-- ============================================================
-- 清理 songs 表中不属于「网抑云 / 米兔 / 布谷」三个音源的歌曲
--
-- 判定依据：songs 表没有 source 列，音源信息只存在于
--   audio_url = https://<host>/api/song/stream?source=<source>&id=<id>
-- 因此用 audio_url 的 source 参数白名单判断。
--
-- 保留：source=netease / source=mitu / source=bugu
-- 删除：其余（含历史 qq / 蛋蛋源、空 url、非本项目格式的行）
--
-- 执行：
--   cd apps/worker
--   npx wrangler d1 execute music-core-db --remote --file=./scripts/cleanup-songs.sql
-- 或在 Cloudflare 控制台 D1 → Console 中整段粘贴执行
-- ============================================================

-- ---------- 1. 预览：先看会删多少 ----------
SELECT
  SUM(CASE WHEN COALESCE(audio_url, '') LIKE '%source=netease%' THEN 1 ELSE 0 END) AS keep_netease,
  SUM(CASE WHEN COALESCE(audio_url, '') LIKE '%source=mitu%' THEN 1 ELSE 0 END)    AS keep_mitu,
  SUM(CASE WHEN COALESCE(audio_url, '') LIKE '%source=bugu%' THEN 1 ELSE 0 END)    AS keep_bugu,
  SUM(
    CASE
      WHEN COALESCE(audio_url, '') NOT LIKE '%source=netease%'
       AND COALESCE(audio_url, '') NOT LIKE '%source=mitu%'
       AND COALESCE(audio_url, '') NOT LIKE '%source=bugu%' THEN 1
      ELSE 0
    END
  ) AS will_delete,
  COUNT(*) AS total
FROM songs;

-- ---------- 2. 归集待删除的歌曲 id ----------
DROP TABLE IF EXISTS _cleanup_song_ids;
CREATE TABLE _cleanup_song_ids (id INTEGER PRIMARY KEY);
INSERT INTO _cleanup_song_ids (id)
SELECT id FROM songs
WHERE COALESCE(audio_url, '') NOT LIKE '%source=netease%'
  AND COALESCE(audio_url, '') NOT LIKE '%source=mitu%'
  AND COALESCE(audio_url, '') NOT LIKE '%source=bugu%';

-- ---------- 3. 先清关联数据，避免留下孤儿记录 ----------
-- 评论点赞（依赖 song_comment）
DELETE FROM song_comment_like
WHERE comment_id IN (
  SELECT id FROM song_comment WHERE song_id IN (SELECT id FROM _cleanup_song_ids)
);

-- 评论（含回复，回复同样带 song_id）
DELETE FROM song_comment
WHERE song_id IN (SELECT id FROM _cleanup_song_ids);

-- 评论通知（target_id = 歌曲 id）
DELETE FROM user_notification
WHERE type = 'comment_reply'
  AND target_id IN (SELECT id FROM _cleanup_song_ids);

-- 歌曲标签
DELETE FROM song_tag
WHERE song_id IN (SELECT id FROM _cleanup_song_ids);

-- 收藏
DELETE FROM user_favorite
WHERE song_id IN (SELECT id FROM _cleanup_song_ids);

-- 播放记录
DELETE FROM user_play_record
WHERE song_id IN (SELECT id FROM _cleanup_song_ids);

-- 歌单内歌曲
DELETE FROM playlist_song
WHERE song_id IN (SELECT id FROM _cleanup_song_ids);

-- 分享记录
DELETE FROM share_user
WHERE target_type = 'song'
  AND CAST(target_id AS INTEGER) IN (SELECT id FROM _cleanup_song_ids);

-- ---------- 4. 删除歌曲本体 ----------
DELETE FROM songs
WHERE id IN (SELECT id FROM _cleanup_song_ids);

-- ---------- 5. 收尾：删除临时表并复核 ----------
DROP TABLE _cleanup_song_ids;

SELECT COUNT(*) AS remaining_songs FROM songs;
