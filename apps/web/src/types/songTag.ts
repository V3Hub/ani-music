/** 歌曲标签聚合项（用户端） */
export interface SongTagItem {
  tag: string
  /** 打该标签的人数 */
  count: number
  /** 当前用户是否已打该标签 */
  mine: boolean
}

/** 热门标签（听歌模式动态生成用） */
export interface HotSongTagItem {
  tag: string
  count: number
}

/** 管理员标签列表条目 */
export interface AdminSongTagItem {
  id: number
  song_id: number
  tag: string
  user_id: number
  username?: string
  /** 歌曲信息（关联 songs 表） */
  title?: string
  artist?: string
  cover_url?: string
  create_time: string
}

/** 管理员标签列表查询参数 */
export interface AdminSongTagQuery {
  /** 同时匹配标签、歌曲名、歌手与用户名 */
  keyword?: string
  page?: number
  pageSize?: number
}
