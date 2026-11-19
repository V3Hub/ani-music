/**
 * 更新日志 —— 版本号与 package.json 保持一致，
 * 由 `npm run release` 自动 bump 并追加条目。
 *
 * 条目类型：feat 新功能 / fix 修复 / opt 优化 / docs 文档 / other 其他
 */
export type ChangelogType = 'feat' | 'fix' | 'opt' | 'docs' | 'other'

export interface ChangelogEntry {
  /** 版本号（与 package.json 一致） */
  version: string
  /** 发布日期 YYYY-MM-DD */
  date: string
  items: Array<{ type: ChangelogType, text: string }>
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.1.5',
    date: '2026-11-19',
    items: [
      { type: 'fix', text: 'release 脚本 lint 注释清理' },
    ],
  },
  {
    version: '0.1.4',
    date: '2026-11-19',
    items: [
      { type: 'feat', text: '新增歌曲标签：用户可给歌曲打标签，听歌模式根据热门标签动态生成场景' },
      { type: 'feat', text: '管理员歌曲标签管理页：搜索、批量删除标签' },
      { type: 'feat', text: '账号详情支持修改密码、逐项编辑用户名/昵称/头像' },
      { type: 'fix', text: '快速切歌时封面图与声音错位：错误自动切歌不再重排队列避免 Swiper 重建竞态' },
      { type: 'fix', text: '管理员页面刷新时偶发提示无权限：onMounted 先拉取用户资料再判断权限' },
      { type: 'feat', text: '新增错误日志上报与管理员查看页' },
    ],
  },
  {
    version: '0.1.3',
    date: '2026-11-18',
    items: [
      { type: 'feat', text: '听歌模式联动最热歌曲：切换模式立即刷新榜单' },
      { type: 'feat', text: '30 首听完自动切换下一批' },
      { type: 'fix', text: '播放失败自动切歌并把失败歌曲降到歌单末尾' },
    ],
  },
  {
    version: '0.1.2',
    date: '2026-11-17',
    items: [
      { type: 'feat', text: '歌曲操作面板：喜欢、添加到歌单、分享、下载' },
      { type: 'feat', text: '歌曲评论与评论点赞' },
      { type: 'feat', text: '心愿墙：发布心愿、点赞、留言' },
    ],
  },
  {
    version: '0.1.1',
    date: '2026-11-16',
    items: [
      { type: 'feat', text: '歌单：创建、订阅、搜索、发现' },
      { type: 'feat', text: '收藏列表与播放记录' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-11-15',
    items: [
      { type: 'feat', text: '首发：搜索歌曲、播放、轮播封面、歌词同步' },
      { type: 'feat', text: '用户注册 / 登录 / 自动登录' },
    ],
  },
]

/** 类型对应的中文标签与颜色 */
export const CHANGELOG_TYPE_META: Record<ChangelogType, { label: string, color: string }> = {
  feat: { label: '新功能', color: '#4CAF50' },
  fix: { label: '修复', color: '#F44336' },
  opt: { label: '优化', color: '#2196F3' },
  docs: { label: '文档', color: '#9C27B0' },
  other: { label: '其他', color: '#9E9E9E' },
}

/** 最近一次发布的版本号（CHANGELOG 第一条） */
export const LATEST_VERSION = CHANGELOG[0]?.version ?? '0.0.0'
