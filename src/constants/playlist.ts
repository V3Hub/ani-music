/** 歌单来源标识（区分「我喜欢的」「历史播放」「用户歌单」「发现」） */
export const PlaylistSource = {
  favorite: 'favorite',
  playRecord: 'playRecord',
  playlist: 'playlist',
  discover: 'discover',
} as const

export type PlaylistSourceValue = typeof PlaylistSource[keyof typeof PlaylistSource]
