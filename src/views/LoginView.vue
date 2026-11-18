<template>
  <div class="login-page">
    <header class="login-header">
      <button type="button" class="back-btn" @click="goBack">
        <van-icon name="arrow-left" />
      </button>
      <span class="header-title">账号登录</span>
      <span class="header-space" />
    </header>

    <main class="login-main">
      <div class="brand">
        <div class="brand-glow" />
        <img class="brand-logo" :src="LOGO_URL" alt="">
        <h1>欢迎回来</h1>
        <p>登录后同步你的歌单、收藏与心愿</p>
      </div>

      <form class="login-form" @submit.prevent="submit">
        <label class="field">
          <van-icon class="field-icon" name="user-o" />
          <input
            v-model="username"
            type="text"
            autocomplete="username"
            placeholder="用户名 / 手机号 / 邮箱"
          >
        </label>
        <label class="field">
          <van-icon class="field-icon" name="lock" />
          <input
            v-model="password"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
            placeholder="请输入密码"
          >
          <button type="button" class="eye-btn" @click="showPassword = !showPassword">
            <van-icon :name="showPassword ? 'eye-o' : 'closed-eye'" />
          </button>
        </label>

        <button class="submit-btn" type="submit" :disabled="loading">
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </form>

      <div class="login-tips">
        <p>
          还没有账号？
          <button type="button" class="register-link" @click="router.push('/register')">
            注册会员
          </button>
        </p>
      </div>
    </main>

    <!-- 账号命中多个用户时，选择本次登录的账号 -->
    <van-popup
      v-model:show="chooseVisible"
      position="bottom"
      round
      teleport="body"
      class="account-choose"
    >
      <div class="choose-sheet">
        <div class="choose-title">
          选择要登录的账号
        </div>
        <p class="choose-hint">
          该账号匹配到多个用户，请选择本次登录的账号
        </p>
        <ul class="choose-list">
          <li
            v-for="item in candidates"
            :key="item.id"
            class="choose-item"
            @click="loginAs(item.id)"
          >
            <img class="choose-avatar" :src="candidateAvatar(item)" alt="">
            <div class="choose-meta">
              <span class="choose-name">{{ item.nickname || item.username || `用户 ${item.id}` }}</span>
              <span class="choose-username">@{{ item.username || item.id }}</span>
            </div>
            <VipBadge :level="item.vipLevel" small />
            <van-icon name="arrow" class="choose-arrow" />
          </li>
        </ul>
      </div>
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { login } from '@/api/user'
import VipBadge from '@/components/common/VipBadge.vue'
import { LOGIN_RETURN_OWNER_KEY } from '@/constants/auth'
import { useUserStore } from '@/stores/user'
import { useUserProfileStore } from '@/stores/userProfile'
import type { LoginCandidate } from '@/types/user'
import { resolveAvatar } from '@/utils/avatar'
import { showToast } from 'vant'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const LOGO_URL = '/qs.svg'

const router = useRouter()
const userStore = useUserStore()
const profileStore = useUserProfileStore()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
/** 账号命中多个用户时的候选列表 */
const candidates = ref<LoginCandidate[]>([])
const chooseVisible = ref(false)

function candidateAvatar(item: LoginCandidate) {
  return resolveAvatar(
    item.avatar,
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(item.username || String(item.id))}`,
  )
}

/** 登录：写入 token 与资料后回到首页，「我的」页在挂载时读取标记自动切回 */
async function submit() {
  await doLogin()
}

/** userId 为空时先按账号密码匹配；命中多个账号则弹出选择，选中后带上 userId 重新登录 */
async function doLogin(userId?: number) {
  const name = username.value.trim()
  if (!name || !password.value) {
    showToast('请输入账号和密码')
    return
  }
  if (loading.value)
    return
  loading.value = true
  try {
    const result = await login(name, password.value, userId)
    if ('needChoose' in result) {
      candidates.value = result.accounts
      chooseVisible.value = true
      return
    }
    userStore.setToken(result.token)
    profileStore.applyProfile(result.user)
    userStore.saveAccount(result.user, result.token)
    sessionStorage.setItem(LOGIN_RETURN_OWNER_KEY, '1')
    chooseVisible.value = false
    showToast('登录成功')
    router.replace('/')
  } catch {
    // 错误提示已由请求拦截器统一处理
  } finally {
    loading.value = false
  }
}

function loginAs(userId: number) {
  chooseVisible.value = false
  doLogin(userId)
}

/** 返回首页时切回「我的」页 */
function goBack() {
  sessionStorage.setItem(LOGIN_RETURN_OWNER_KEY, '1')
  router.replace('/')
}
</script>

<style scoped>
.login-page {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #fff;
}

.aurora,
.stars {
  display: none;
}

.brand {
  position: relative;
  text-align: center;

  .brand-glow {
    position: absolute;
    top: -36px;
    left: 50%;
    width: 220px;
    height: 220px;
    transform: translateX(-50%);
    background: radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.18), transparent 70%);
    filter: blur(22px);
    animation: brand-glow 14s ease-in-out infinite alternate;
    pointer-events: none;
    z-index: 0;
  }

  .brand-logo {
    position: relative;
    z-index: 1;
    width: 64px;
    height: 64px;
    margin-bottom: 14px;
    border-radius: 18px;
    box-shadow: 0 12px 30px rgba(168, 85, 247, 0.35);
  }

  h1 {
    position: relative;
    z-index: 1;
    margin: 0 0 8px;
    font-size: 24px;
    font-weight: 600;
    letter-spacing: 1px;
  }

  p {
    position: relative;
    z-index: 1;
    margin: 0;
    font-size: 13px;
    opacity: 0.55;
  }
}

@keyframes brand-glow {
  from {
    transform: translateX(-50%) scale(1);
    opacity: 0.9;
  }
  to {
    transform: translateX(-50%) scale(1.12);
    opacity: 1;
  }
}

.login-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(10px + env(safe-area-inset-top)) 14px 0;

  .back-btn,
  .header-space {
    width: 34px;
    height: 34px;
  }

  .back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    font-size: 18px;
    cursor: pointer;
  }

  .header-title {
    font-size: 15px;
    opacity: 0.8;
  }
}

.login-main {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: 28px;
  padding: 0 28px calc(48px + env(safe-area-inset-bottom));
  overflow-y: auto;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 50px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  transition:
    border-color 0.2s ease,
    background 0.2s ease;

  &:focus-within {
    border-color: rgba(168, 85, 247, 0.6);
    background: rgba(255, 255, 255, 0.09);
  }

  .field-icon {
    flex-shrink: 0;
    font-size: 18px;
    opacity: 0.6;
  }

  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: none;
    background: transparent;
    color: #fff;
    font-family: inherit;
    font-size: 15px;
  }

  input::placeholder {
    color: rgba(255, 255, 255, 0.35);
  }

  .eye-btn {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    padding: 4px;
    border: 0;
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    font-size: 17px;
    cursor: pointer;
  }
}

.submit-btn {
  height: 48px;
  margin-top: 6px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 14px;
  color: #fff;
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 1px;
  background: rgba(255, 255, 255, 0.16);
  cursor: pointer;
  transition:
    opacity 0.2s ease,
    transform 0.2s ease,
    background-color 0.2s ease;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &:not(:disabled):active {
    transform: scale(0.98);
    background: rgba(255, 255, 255, 0.24);
  }
}

.login-tips {
  text-align: center;

  p {
    margin: 0 0 12px;
    font-size: 12px;
    opacity: 0.4;
  }

  .register-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: #a78bfa;
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
  }
}

.account-choose {
  background: var(--popup-bg-raised, #1b1b24);
}

.choose-sheet {
  padding: 4px 20px calc(20px + env(safe-area-inset-bottom));
  color: #fff;
}

.choose-title {
  padding: 16px 0 6px;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
}

.choose-hint {
  margin: 0 0 14px;
  text-align: center;
  font-size: 12px;
  opacity: 0.45;
}

.choose-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.choose-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;

  &:active {
    background: rgba(255, 255, 255, 0.1);
  }
}

.choose-avatar {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  object-fit: cover;
}

.choose-meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.choose-name {
  overflow: hidden;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.choose-username {
  font-size: 11px;
  opacity: 0.45;
}

.choose-arrow {
  flex-shrink: 0;
  font-size: 14px;
  opacity: 0.4;
}
</style>
