/**
 * 用户资料 —— 昵称与头像（头像来自数据库 base64）
 */
import type { UserProfile } from '@/types/user'
import { getUserProfile } from '@/api/user'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useUserStore } from './user'

export const useUserProfileStore = defineStore('userProfile', () => {
  const username = ref('')
  const nickname = ref('')
  /** 原样保存数据库里的头像值（base64 / data URL），展示时交给 resolveAvatar */
  const avatar = ref('')

  function applyProfile(profile?: UserProfile | null) {
    username.value = profile?.username || ''
    nickname.value = profile?.nickname || ''
    avatar.value = profile?.avatar || ''
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

  return { username, nickname, avatar, applyProfile, fetchProfile }
})
