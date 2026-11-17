/** 心愿墙：单条心愿 */
export interface Wish {
  id: number
  userId: string
  content: string
  likeCount: number
  messageCount: number
  liked: boolean
  mine: boolean
  createTime: number
}

/** 心愿留言 */
export interface WishMessage {
  id: number
  wishId: number
  userId: string
  content: string
  mine: boolean
  createTime: number
  /** 仅新增留言时返回，便于同步心愿卡片的留言数 */
  messageCount?: number
}
