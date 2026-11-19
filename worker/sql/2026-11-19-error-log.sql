-- =============================================================
-- ani-music 接口错误日志表
-- 在 Cloudflare D1 控制台或 wrangler d1 execute 中执行
-- =============================================================

-- 用户端访问接口出错时上报一条记录；断网 / 超时等用户自身网络问题不上报
CREATE TABLE IF NOT EXISTS error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,                       -- 上报时的用户 users.id（登录失效时为空）
  username TEXT,                         -- 上报时的用户名（冗余存储便于检索）
  url TEXT NOT NULL,                     -- 出错接口路径（不含域名）
  method TEXT NOT NULL DEFAULT 'GET',    -- 请求方法
  http_status INTEGER DEFAULT 0,         -- HTTP 状态码（业务错误为 200）
  biz_code INTEGER,                      -- 后端业务 code
  message TEXT,                          -- 错误信息
  detail TEXT,                           -- JSON：请求参数 / 响应体 / 页面 / 客户端时间
  status TEXT NOT NULL DEFAULT 'new',    -- new 未处理 / resolved 已处理
  create_time DATETIME DEFAULT (DATETIME('now')) -- 上报时间（UTC）
);

CREATE INDEX IF NOT EXISTS idx_error_log_status ON error_log(status);
CREATE INDEX IF NOT EXISTS idx_error_log_user ON error_log(user_id);
CREATE INDEX IF NOT EXISTS idx_error_log_create_time ON error_log(create_time);
