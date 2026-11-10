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
  /** 歌曲加载状态 */
  loading?: boolean
  /** 歌曲是否正在播放 */
  isPlaying?: boolean
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
  /** 运行时附加：来源 */
  source?: string | number
  /** 运行时附加：所属用户标识 */
  userToken?: string
}

/** 当前打开歌单的上下文（抽屉展示用） */
export interface PlaylistContext {
  playlist: PlaylistItem | null
  songs: Song[]
}
