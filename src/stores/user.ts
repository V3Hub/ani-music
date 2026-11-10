/**
 * 用户状态 —— token 与鉴权相关。
 *
 * 职责：
 *  - token 作为单一真相源（single source of truth）
 *  - localStorage 持久化（key: AIN_MUSIC_TOKEN）
 *  - axios 拦截器 / 自动登录 / 任意业务代码 都从此读写
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const TOKEN_KEY = 'AIN_MUSIC_TOKEN'

function tryReadLocal(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function tryWriteLocal(token: string | null) {
  try {
    if (token === null)
      localStorage.removeItem(TOKEN_KEY)
    else
      localStorage.setItem(TOKEN_KEY, token)
  } catch { /* 隐私模式下可能写入失败，忽略 */ }
}

export const useUserStore = defineStore('user', () => {
  // ------- state -------
  const token = ref<string | null>(tryReadLocal())

  // ------- getters -------
  const isLoggedIn = computed(() => !!token.value)

  // ------- actions -------

  /** 写入 token（内存 + localStorage） */
  function setToken(value: string) {
    token.value = value
    tryWriteLocal(value)
  }

  /** 清除 token（内存 + localStorage） */
  function clearToken() {
    token.value = null
    tryWriteLocal(null)
  }

  /** 读取当前 token，便于 axios 拦截器等同步场景调用 */
  function getToken(): string | null {
    return token.value
  }

  return {
    // state
    token,
    // getters
    isLoggedIn,
    // actions
    setToken,
    clearToken,
    getToken,
  }
})
