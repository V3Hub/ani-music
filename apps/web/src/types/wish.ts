/** 心愿墙：单条心愿 */
export interface Wish {
  id: number
  userId: string
  /** 作者昵称（后端 users 表关联） */
  nickname?: string
  /** 作者头像（base64 / data URL） */
  avatar?: string
  /** 作者 VIP 等级 */
  vipLevel?: number
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
  /** 留言者昵称 */
  nickname?: string
  /** 留言者头像 */
  avatar?: string
  /** 留言者 VIP 等级 */
  vipLevel?: number
  content: string
  mine: boolean
  createTime: number
  /** 仅新增留言时返回，便于同步心愿卡片的留言数 */
  messageCount?: number
}
