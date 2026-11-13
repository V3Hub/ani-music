/** 播放源选项 */
export interface PlaybackSourceOption {
  label: string
  value: string
  /** 可选图标（Vant icon 名称） */
  icon?: string
}

export const PLAYBACK_SOURCES: PlaybackSourceOption[] = [
  { label: '网抑云音乐', value: 'netease' },
  { label: '蛋蛋音乐', value: 'qq' },
  { label: '米兔音乐', value: 'mitu' },
]

/** 播放源标识 —— 即 PLAYBACK_SOURCES 中各项的 value */
export type PlaybackSource = (typeof PLAYBACK_SOURCES)[number]['value']

/** 听歌模式 */
export interface ListeningModeOption {
  value: string
  label: string
}

export const LISTENING_MODES: ListeningModeOption[] = [
  { value: 'default', label: '默认模式' },
  { value: 'familiar', label: '熟悉模式' },
  { value: 'fresh', label: '新鲜模式' },
]

/** 听歌场景 */
export interface ListeningSceneOption {
  value: string
  label: string
  icon: string
}

export const LISTENING_SCENES: ListeningSceneOption[] = [
  { value: 'library', label: '图书馆', icon: 'book-o' },
  { value: 'emo', label: '深夜EMO', icon: 'moon-o' },
  { value: 'dj', label: 'DJ模式', icon: 'music-o' },
  { value: 'sleep', label: '助眠模式', icon: 'clear' },
]

/** 底部导航 */
export interface PlayerNavItem {
  label: string
  key: string
}

export const PLAYER_NAV_ITEMS: PlayerNavItem[] = [
  { label: '发现', key: 'discover' },
  { label: '听抖音', key: 'rank' },
  { label: '音乐', key: 'music' },
  { label: '福利', key: 'benefit' },
  { label: '我的', key: 'owner' },
]
