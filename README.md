# Ani 音乐 · Ani Music

> Music always with you
> 总有声音，与你同行

一个移动端优先的在线音乐播放器。以「听歌」为核心，围绕播放、收藏、歌单、发现、评论、心愿墙与福利页，构建一套完整的日常陪伴体验。

- 前端：Vue 3 + Vite + TypeScript，纯前端托管（Cloudflare Pages）
- 后端：Cloudflare Worker + D1（SQLite），提供用户、歌曲、歌单、评论、心愿等接口

## 功能特性

### 播放

- 全屏播放页，封面随歌曲主题色联动（自动提取主色并生成深色主题）
- 歌词同步滚动、播放进度与音量控制
- 播放队列管理：查看、切歌、移除、分享、下载
- 多种播放源切换、定时关闭（睡眠定时器）
- 播放模式：顺序 / 单曲循环 / 随机
- 左右滑动切换歌曲，右侧抽屉切换「听歌模式 / 场景」
- 兼容老旧浏览器（额外产出 legacy 包）

### 音乐库

- 多音源搜索（关键词搜索歌曲、歌单）
- 热门推荐、发现页歌单推荐
- 收藏歌曲、最近播放记录
- 歌单：创建、收藏（订阅）、编辑、排序、添加/移除歌曲
- 支持分享歌曲与歌单（分享链接可通过 `/song/:id`、`/playlist/:id` 直达）

### 社区与互动

- 歌曲评论：列表、分页、默认/最新排序、点赞、回复、删除
- 心愿墙：发布心愿、点亮、留言祝福
- 福利中心：会员权益与优惠券展示
- 用户身份统一展示真实昵称与头像（登录后评论、心愿、歌单均生效）

### 账号

- 指纹自动登录（默认游客身份，无需注册）
- 用户名 / 手机号 / 邮箱均可登录，命中多个账号时先选择账号
- 会员注册：填写资料并上传 ¥1.99 付款截图，管理员审批通过后开通永久 VIP
- 永久 VIP 分 1–9 级，管理员可调级并保留完整变更记录，页面展示 VIP 标识
- 账号详情支持修改头像、昵称、用户名，设置中可切换账号
- 退出登录一键回到游客身份

### 管理

- 注册审批：查看待审列表、付款截图、通过或拒绝申请
- VIP 管理：调整等级、查看变更记录
- 内容管理：管理员可删除他人歌单、评论与心愿

### 体验细节

- 所有底部/侧边弹层支持手势滑动关闭，跟随手指、无抖动
- 弹层背景跟随歌曲主题色，一级/二级弹层有明确层级区分
- 统一暗色设计规范：半透明卡片、细边框、胶囊输入条

## 技术栈

| 分类 | 选型                                   |
| ---- | -------------------------------------- |
| 框架 | Vue 3（`<script setup>` + TypeScript） |
| 构建 | Vite 5、`@vitejs/plugin-legacy`        |
| UI   | Vant 4（自动按需引入）、UnoCSS         |
| 状态 | Pinia                                  |
| 路由 | Vue Router 4                           |
| 请求 | Axios                                  |
| 样式 | SCSS + CSS 变量（主题色动态注入）      |
| 轮播 | Swiper                                 |
| 指纹 | `@thumbmarkjs/thumbmarkjs`             |
| 后端 | Cloudflare Workers + D1 + Wrangler     |

## 目录结构

```text
ani-music/
├─ public/                 # 静态资源
├─ src/
│  ├─ api/                 # 接口封装（music / user / wish）
│  ├─ components/
│  │  ├─ player/           # 播放页、工具栏、队列、评论、搜索等
│  │  ├─ playlist/         # 歌单卡片、详情抽屉、操作面板
│  │  ├─ discover/         # 发现页
│  │  ├─ owner/            # 「我的」页
│  │  ├─ welfare/          # 福利页
│  │  ├─ wish/             # 心愿墙
│  │  └─ waveBox/          # 音频可视化
│  ├─ composables/         # 组合式逻辑（播放、列表、滑动关闭等）
│  ├─ constants/           # 常量配置
│  ├─ router/              # 路由
│  ├─ services/            # 音频播放器、歌词缓存、主题色、远程控制
│  ├─ stores/              # Pinia（播放器、用户、资料）
│  ├─ styles/              # 全局样式与设计变量
│  ├─ types/               # 类型定义
│  ├─ utils/               # 请求、头像、分享、下载等工具
│  └─ views/               # 页面入口（PlayerView / LoginView）
├─ worker/
│  └─ music-core-worker.js # Cloudflare Worker 后端（D1）
├─ vite.config.ts
└─ package.json
```

## 快速开始

环境要求：Node.js >= 24，pnpm >= 12。

```bash
# 安装依赖
pnpm install

# 启动开发服务（默认 http://localhost:5173）
pnpm dev

# 类型检查 + 生产构建
pnpm build

# 本地预览构建产物
pnpm preview

# 代码检查
pnpm lint
pnpm lint:fix
```

## 环境变量

仓库根目录的 `.env` 为公共配置，`.env.development` 仅在本地开发生效。

| 变量                    | 说明                                         |
| ----------------------- | -------------------------------------------- |
| `VITE_APP_TITLE`        | 页面标题                                     |
| `VITE_API_BASE_URL`     | 接口基础地址（生产环境）                     |
| `VITE_API_TIMEOUT`      | 请求超时时间（毫秒，默认 10000）             |
| `VITE_API_PROXY_TARGET` | 开发环境 `/api` 代理目标（仅 vite dev 使用） |

开发时前端请求 `/api/*` 会由 Vite 代理转发到 `VITE_API_PROXY_TARGET`，路径保留 `/api` 前缀。

## 路由

| 路径            | 说明                                                 |
| --------------- | ---------------------------------------------------- |
| `/`             | 主页面（发现 / 音乐 / 福利 / 我的 通过底部导航切换） |
| `/song/:id`     | 歌曲分享直达                                         |
| `/playlist/:id` | 歌单分享直达                                         |
| `/login`        | 登录页                                               |
| `/register`     | 会员注册与审批进度                                   |
| `/account`      | 账号详情                                             |
| `/admin/review` | 注册审批（仅管理员）                                 |
| `/about`        | 关于                                                 |

## 后端 Worker

后端位于 `worker/music-core-worker.js`，基于 Cloudflare Worker + D1，入口按路径分发：

- 用户：自动登录、账号登录、资料查询与修改
- 会员：注册申请、审批进度、管理员审批、VIP 调级与变更记录
- 歌曲：搜索、详情、播放地址、主题色、推荐
- 收藏与记录：收藏列表、最近播放
- 歌单：创建、删除、详情、加歌/排序/移歌、发现、搜索、分享
- 互动：歌曲评论（发布/分页/点赞/删除）、心愿墙（发布/点亮/留言）
- 鉴权：`Authorization: Bearer <token>`，token 由 `userId` 签名生成

D1 绑定名为 `DB`。部署步骤：

1. 在 Cloudflare 控制台创建 D1 数据库，并初始化 `users`、`song`、`playlist`、`song_comment`、`wish` 等表
2. 已有数据库升级请执行 [worker/sql/2026-11-18-registration.sql](./worker/sql/2026-11-18-registration.sql)（注册审批、VIP 等级与记录）
3. 在 Worker 设置中绑定 D1，变量名为 `DB`
4. 部署 Worker，并将 `VITE_API_BASE_URL` 指向该 Worker 域名
5. 前端构建产物通过 `pnpm deploy`（Wrangler Pages）部署

> 注意：需要重新部署 Worker 后，后端的接口与数据结构变更才会生效。

## 设计约定

- 弹层背景：`--popup-bg`（主题底色 + 6% 白）用于一级弹层，`--popup-bg-raised`（主题底色 + 13% 白）用于二级弹层
- 主题色：由 `services/theme-color.ts` 根据当前封面提取主色，写入 `--theme-background` 等 CSS 变量
- 时间：服务端统一使用 UTC（`DATETIME('now')`），前端按本地时区展示

## 许可证

[MIT](./LICENSE) © 2026 Ani
