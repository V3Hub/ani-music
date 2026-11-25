/**
 * 用户资料 —— 昵称与头像（头像来自数据库 base64）
 */
import type { UserProfile } from '@/types/user'
import { getUserProfile } from '@/api/user'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useUserStore } from './user'

export const useUserProfileStore = defineStore('userProfile', () => {
  /** 用户 id（仅登录后有值） */
  const id = ref(0)
  const username = ref('')
  const nickname = ref('')
  /** 原样保存数据库里的头像值（base64 / data URL），展示时交给 resolveAvatar */
  const avatar = ref('')
  /** 是否管理员（控制注册审批入口） */
  const isAdmin = ref(false)
  /** 永久 VIP 等级：0 非会员，1-9 等级 */
  const vipLevel = ref(0)

  function applyProfile(profile?: UserProfile | null) {
    id.value = profile?.id || 0
    username.value = profile?.username || ''
    nickname.value = profile?.nickname || ''
    avatar.value = profile?.avatar || ''
    isAdmin.value = !!profile?.isAdmin
    vipLevel.value = profile?.vipLevel || 0
  }

  /** 拉取当前登录用户资料；未登录或接口不可用时回退为空资料 */
  async function fetchProfile() {
    if (!useUserStore().getToken()) {
      applyProfile(null)
      return
    }
    try {
      applyProfile(await getUserProfile())
    } catch {
      // 保持当前资料，页面回退到默认头像与 userToken
    }
  }

  return { id, username, nickname, avatar, isAdmin, vipLevel, applyProfile, fetchProfile }
})
