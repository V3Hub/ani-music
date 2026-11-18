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
            placeholder="请输入用户名"
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
        <p>本应用不开放注册，账号由管理员分配</p>
        <button type="button" class="tool-link" @click="toolVisible = true">
          <van-icon name="shield-o" />
          密码生成工具
        </button>
      </div>
    </main>

    <van-popup
      v-model:show="toolVisible"
      position="bottom"
      round
      teleport="body"
      class="pwd-tool"
    >
      <div class="tool-wrap">
        <div class="tool-head">
          <span class="tool-title">密码生成工具</span>
          <button type="button" class="tool-close" @click="toolVisible = false">关闭</button>
        </div>
        <div class="tool-row">
          <input
            v-model="toolPassword"
            class="tool-input"
            type="text"
            placeholder="输入密码或点击随机生成"
            @input="toolHash = ''"
          >
          <button type="button" class="tool-btn ghost" @click="fillRandom">随机生成</button>
        </div>

        <div class="tool-hash">
          <div class="tool-hash-head">
            <span>密码存储值</span>
            <button
              type="button"
              class="tool-copy"
              :disabled="!toolHash"
              @click="copyHash"
            >
              复制
            </button>
          </div>
          <div class="tool-hash-value" :class="{ empty: !toolHash }">
            {{ toolHash || '点击下方按钮生成' }}
          </div>
        </div>

        <button type="button" class="submit-btn tool-submit" @click="generateHash">
          生成存储值
        </button>
      </div>
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { login } from '@/api/user'
import { LOGIN_RETURN_OWNER_KEY } from '@/constants/auth'
import { useUserStore } from '@/stores/user'
import { useUserProfileStore } from '@/stores/userProfile'
import { hashPassword, randomPassword } from '@/utils/password'
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

const toolVisible = ref(false)
const toolPassword = ref('')
const toolHash = ref('')

/** 登录：写入 token 与资料后回到首页，「我的」页在挂载时读取标记自动切回 */
async function submit() {
  const name = username.value.trim()
  if (!name || !password.value) {
    showToast('请输入用户名和密码')
    return
  }
  if (loading.value)
    return
  loading.value = true
  try {
    const result = await login(name, password.value)
    userStore.setToken(result.token)
    profileStore.applyProfile(result.user)
    sessionStorage.setItem(LOGIN_RETURN_OWNER_KEY, '1')
    showToast('登录成功')
    router.replace('/')
  } catch {
    // 错误提示已由请求拦截器统一处理
  } finally {
    loading.value = false
  }
}

function goBack() {
  router.replace('/')
}

async function fillRandom() {
  toolPassword.value = randomPassword()
  await generateHash()
}

async function generateHash() {
  if (!toolPassword.value) {
    showToast('请先输入密码')
    return
  }
  try {
    toolHash.value = await hashPassword(toolPassword.value)
  } catch (err) {
    console.error('[password] hash 失败', err)
    showToast('哈希失败：请在 HTTPS 或 localhost 环境下使用')
  }
}

async function copyHash() {
  if (!toolHash.value)
    return
  try {
    await navigator.clipboard.writeText(toolHash.value)
    showToast('已复制')
  } catch {
    showToast('复制失败，请长按选择')
  }
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

  .tool-link {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 14px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.65);
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
  }
}

.pwd-tool {
  background: var(--popup-bg);
}

.tool-wrap {
  padding: 18px 20px calc(18px + env(safe-area-inset-bottom));
  color: #fff;
}

.tool-head {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .tool-title {
    font-size: 16px;
    font-weight: 600;
  }

  .tool-close {
    border: 0;
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    font-size: 13px;
    cursor: pointer;
  }
}

.tool-desc {
  margin: 10px 0 16px;
  font-size: 12px;
  line-height: 1.6;
  opacity: 0.5;
}

.tool-row {
  margin-top: 14px;
  display: flex;
  gap: 10px;

  .tool-input {
    flex: 1;
    min-width: 0;
    height: 44px;
    padding: 0 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    outline: none;
    background: rgba(255, 255, 255, 0.06);
    color: #fff;
    font-family: inherit;
    font-size: 14px;
  }

  .tool-input::placeholder {
    color: rgba(255, 255, 255, 0.32);
  }

  .tool-btn {
    flex-shrink: 0;
    height: 44px;
    padding: 0 14px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.8);
    font-family: inherit;
    font-size: 13px;
    cursor: pointer;
  }
}

.tool-hash {
  margin-top: 14px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);

  .tool-hash-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 12px;
    opacity: 0.6;
  }

  .tool-copy {
    padding: 3px 10px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 999px;
    background: transparent;
    color: rgba(255, 255, 255, 0.75);
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;

    &:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }
  }

  .tool-hash-value {
    font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    font-size: 11px;
    line-height: 1.6;
    word-break: break-all;
    user-select: all;

    &.empty {
      font-family: inherit;
      opacity: 0.35;
      user-select: none;
    }
  }
}

.tool-submit {
  width: 100%;
  margin-top: 14px;
}

.tool-note {
  margin: 14px 0 0;
  font-size: 11px;
  line-height: 1.7;
  opacity: 0.38;
}
</style>
