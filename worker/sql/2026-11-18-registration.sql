-- =============================================================
-- ani-music 会员注册 / 审批功能数据库变更脚本
-- 在 Cloudflare D1 控制台或 wrangler d1 execute 中执行
-- =============================================================

-- 1. users 表扩展：手机号、邮箱、管理员标识
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0;

-- 2. 注册审批表：申请先落库，管理员通过后才更新 users
-- user_id 为必填：提交申请时 userToken 对应的用户 id
-- 已建过旧表（无 user_id 列）时，取消下一行注释重建，旧申请数据不保留
-- DROP TABLE IF EXISTS registration_request;
CREATE TABLE IF NOT EXISTS registration_request (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,              -- 提交申请的 userToken 对应用户 users.id
  username TEXT NOT NULL,                -- 登录用户名（唯一）
  nickname TEXT NOT NULL,                -- 昵称
  password TEXT NOT NULL,                -- SHA-256(密码 + 盐) 存储值
  phone TEXT,                            -- 手机号（选填）
  email TEXT,                            -- 邮箱（选填）
  payment_screenshot TEXT,               -- 付款截图（base64，约 600KB 内）
  status TEXT NOT NULL DEFAULT 'pending',-- pending 待审批 / approved 已通过 / rejected 已拒绝
  reject_reason TEXT,                    -- 拒绝原因
  create_time DATETIME DEFAULT (DATETIME('now')), -- 申请时间（UTC）
  review_time DATETIME,                  -- 审批时间（UTC）
  reviewer_id INTEGER                    -- 审批管理员 users.id
);

-- 常用查询索引
CREATE INDEX IF NOT EXISTS idx_registration_username ON registration_request(username);
CREATE INDEX IF NOT EXISTS idx_registration_status ON registration_request(status);
CREATE INDEX IF NOT EXISTS idx_registration_user ON registration_request(user_id);

-- 3. 指定管理员（把 your_admin_username 换成实际用户名后执行）
-- UPDATE users SET is_admin = 1 WHERE username = 'your_admin_username';

-- =============================================================
-- 永久 VIP 等级体系
-- =============================================================

-- 4. users 表增加 VIP 等级：0 非会员，1-9 永久 VIP 等级（无过期时间）
ALTER TABLE users ADD COLUMN vip_level INTEGER DEFAULT 0;

-- 5. VIP 等级变更记录表：每次开通 / 调级都留痕
CREATE TABLE IF NOT EXISTS vip_record (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,              -- 用户 users.id
  from_level INTEGER NOT NULL DEFAULT 0, -- 变更前等级
  to_level INTEGER NOT NULL,             -- 变更后等级
  change_type TEXT NOT NULL DEFAULT 'admin', -- register 注册开通 / admin 管理员调级
  remark TEXT,                           -- 备注说明
  operator_id INTEGER,                   -- 操作人（管理员 users.id）
  create_time DATETIME DEFAULT (DATETIME('now')) -- 变更时间（UTC）
);
CREATE INDEX IF NOT EXISTS idx_vip_record_user ON vip_record(user_id);

-- 6. 旧库清理：仅已经执行过旧版脚本、users 表存在 is_member 时单独执行
-- ALTER TABLE users DROP COLUMN is_member;
