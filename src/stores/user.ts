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
import type { SavedAccount, UserProfile } from '@/types/user'

const TOKEN_KEY = 'AIN_MUSIC_TOKEN'
const ACCOUNTS_KEY = 'AIN_MUSIC_ACCOUNTS'

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

/** 读取本地保存的可切换账号列表 */
function readAccounts(): SavedAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeAccounts(list: SavedAccount[]) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list))
  } catch { /* 忽略写入失败 */ }
}

export const useUserStore = defineStore('user', () => {
  // ------- state -------
  const token = ref<string | null>(tryReadLocal())
  /** 历史登录账号：用于登录页多用户一键切换 */
  const savedAccounts = ref<SavedAccount[]>(readAccounts())

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

  /** 登录成功后保存账号到历史列表（同 userId 覆盖，最多保留 5 个） */
  function saveAccount(profile: UserProfile, accountToken: string) {
    const item: SavedAccount = {
      userId: profile.id,
      username: profile.username,
      nickname: profile.nickname,
      avatar: profile.avatar,
      token: accountToken,
    }
    const list = [item, ...savedAccounts.value.filter(a => a.userId !== item.userId)].slice(0, 5)
    savedAccounts.value = list
    writeAccounts(list)
  }

  /** 从历史列表移除某个账号 */
  function removeAccount(userId: number) {
    savedAccounts.value = savedAccounts.value.filter(a => a.userId !== userId)
    writeAccounts(savedAccounts.value)
  }

  /** 清空历史账号：退出登录后不再保留可切换的账号 */
  function clearAccounts() {
    savedAccounts.value = []
    writeAccounts([])
  }

  /** 一键切换到历史账号：返回该账号资料供 profile store 使用 */
  function switchAccount(userId: number): SavedAccount | null {
    const target = savedAccounts.value.find(a => a.userId === userId)
    if (!target)
      return null
    setToken(target.token)
    return target
  }

  return {
    // state
    token,
    savedAccounts,
    // getters
    isLoggedIn,
    // actions
    setToken,
    clearToken,
    getToken,
    saveAccount,
    removeAccount,
    clearAccounts,
    switchAccount,
  }
})
