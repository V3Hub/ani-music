import type { PlaybackSource } from '@/constants/player-ui'

/** LRC 歌词行 */
export interface LyricLine {
  /** 时间点（秒） */
  time: number
  /** 歌词文本 */
  txt: string
}

export interface Song {
  id: number | string
  /** 歌词文本；列表接口不返回，播放时从歌曲详情获取 */
  lrc?: string
  pic: string
  singer: string
  /** 歌曲标题 */
  title: string
  /** 歌曲来源（PLAYBACK_SOURCES 的 value） */
  source?: PlaybackSource
  /** 歌曲URL */
  url: string
  /** 歌曲时长（秒） */
  duration?: number
  /** 歌曲专辑 */
  album?: string
  /** 歌曲发布时间 */
  publishTime?: string
  /** 歌曲歌词列表 */
  lyricList?: LyricLine[]
  /** 歌曲主题色（hex） */
  themeColor?: string
  favorite?: boolean
  /** 收藏人数（播放时从歌曲详情获取） */
  favoriteCount?: number
}

export type PlayMode = 'list' | 'loop'

/** 歌单项（用户创建 / 发现推荐） */
export interface PlaylistItem {
  id: number
  name: string
  desc?: string
  pic?: string
  count?: number
  subscribe_count?: number
  owner?: boolean
  user_id?: number
  /** 歌单作者昵称（后端 users 表关联） */
  nickname?: string
  /** 歌单作者头像（base64 / data URL） */
  avatar?: string
  /** 运行时附加：来源 */
  source?: string | number
  /** 运行时附加：所属用户标识 */
  userToken?: string
}

/** 歌曲评论 */
export interface SongComment {
  id: number
  songId: number
  /** 评论者标识（后端由登录 token 生成） */
  userId: string
  /** 评论者昵称（后端 users 表关联） */
  nickname?: string
  /** 评论者头像（base64 / data URL） */
  avatar?: string
  content: string
  /** 顶层评论为 0，回复为所属顶层评论 id */
  parentId: number
  likeCount: number
  /** 回复数量（仅顶层评论有值） */
  replyCount: number
  liked: boolean
  /** 是否是当前用户发布的评论 */
  mine: boolean
  createTime: number
}

/** 当前打开歌单的上下文（抽屉展示用） */
export interface PlaylistContext {
  playlist: PlaylistItem | null
  songs: Song[]
}
