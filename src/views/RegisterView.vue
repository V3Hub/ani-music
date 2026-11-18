<template>
  <div class="register-page">
    <header class="register-header">
      <button type="button" class="back-btn" @click="goBack">
        <van-icon name="arrow-left" />
      </button>
      <span class="header-title">{{ tab === 'register' ? '注册会员' : '审批进度' }}</span>
      <span class="header-space" />
    </header>

    <main class="register-main">
      <div class="tab-bar">
        <button
          type="button"
          class="tab-item"
          :class="{ active: tab === 'register' }"
          @click="tab = 'register'"
        >
          注册会员
        </button>
        <button
          type="button"
          class="tab-item"
          :class="{ active: tab === 'progress' }"
          @click="openProgress"
        >
          审批进度
        </button>
      </div>

      <!-- 注册表单 -->
      <template v-if="tab === 'register'">
        <form class="register-form" @submit.prevent="submit">
          <label class="field">
            <van-icon class="field-icon" name="user-o" />
            <input v-model="username" type="text" placeholder="用户名 *（3-20 位字母数字下划线）">
          </label>
          <label class="field">
            <van-icon class="field-icon" name="smile-o" />
            <input v-model="nickname" type="text" maxlength="20" placeholder="昵称 *">
          </label>
          <label class="field">
            <van-icon class="field-icon" name="lock" />
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="密码 *（至少 6 位）"
            >
            <button type="button" class="eye-btn" @click="showPassword = !showPassword">
              <van-icon :name="showPassword ? 'eye-o' : 'closed-eye'" />
            </button>
          </label>
          <label class="field">
            <van-icon class="field-icon" name="phone-o" />
            <input v-model="phone" type="tel" maxlength="11" placeholder="手机号（选填，可用于登录）">
          </label>
          <label class="field">
            <van-icon class="field-icon" name="envelop-o" />
            <input v-model="email" type="email" placeholder="邮箱（选填，可用于登录）">
          </label>

          <!-- 付款区 -->
          <section class="pay-card">
            <div class="pay-head">
              <span class="pay-title">会员费用</span>
              <span class="pay-amount">¥1.99</span>
            </div>
            <p class="pay-tip">
              请微信扫码支付 1.99 元，支付完成后上传付款截图，管理员审核通过后账号即可生效
            </p>
            <img class="pay-qr" :src="PAY_QR_URL" alt="收款二维码">

            <label class="upload-btn" :class="{ uploaded: !!screenshot }">
              <input type="file" accept="image/*" hidden @change="onPickScreenshot">
              <van-icon :name="screenshot ? 'success' : 'photograph'" />
              <span>{{ screenshot ? '重新上传付款截图' : '上传付款截图 *' }}</span>
            </label>
            <div v-if="screenshot" class="shot-preview" @click="previewVisible = true">
              <img :src="screenshot" alt="付款截图预览">
              <span class="preview-tip">点击放大</span>
            </div>
          </section>

          <button class="submit-btn" type="submit" :disabled="loading">
            {{ loading ? '提交中…' : '提交注册申请' }}
          </button>
          <p class="form-note">
            提交后可在「审批进度」中查看审核状态
          </p>
        </form>
      </template>

      <!-- 审批进度 -->
      <template v-else>
        <form class="progress-form" @submit.prevent="queryProgress">
          <label class="field">
            <van-icon class="field-icon" name="user-o" />
            <input v-model="progressUsername" type="text" placeholder="用户名（选填，换设备时使用）">
          </label>
          <button class="submit-btn" type="submit" :disabled="progressLoading">
            {{ progressLoading ? '查询中…' : '查询进度' }}
          </button>
        </form>

        <p v-if="!progress && queried" class="progress-empty">
          当前账号暂无注册申请
        </p>

        <section v-if="progress" class="progress-card">
          <div class="progress-status" :class="progress.status">
            <van-icon :name="statusIcon" />
            <span>{{ statusText }}</span>
          </div>
          <ul class="progress-info">
            <li><span>用户名</span><span>{{ progress.username }}</span></li>
            <li><span>昵称</span><span>{{ progress.nickname }}</span></li>
            <li><span>申请时间</span><span>{{ formatTime(progress.create_time) }}</span></li>
            <li v-if="progress.review_time">
              <span>审批时间</span><span>{{ formatTime(progress.review_time) }}</span>
            </li>
            <li v-if="progress.status === 'rejected' && progress.reject_reason">
              <span>拒绝原因</span><span class="reject-reason">{{ progress.reject_reason }}</span>
            </li>
          </ul>
          <p v-if="progress.status === 'approved'" class="progress-hint success">
            审批已通过，返回登录页即可使用该账号登录
          </p>
          <p v-else-if="progress.status === 'rejected'" class="progress-hint">
            申请被拒绝，可修改信息后重新提交注册
          </p>
          <p v-else class="progress-hint">
            申请正在审核中，请耐心等待管理员处理
          </p>
        </section>
      </template>
    </main>

    <van-image-preview v-model:show="previewVisible" :images="[screenshot]" />
  </div>
</template>

<script setup lang="ts">
import { register, getRegisterStatus } from '@/api/user'
import type { RegistrationProgress } from '@/types/user'
import { showToast } from 'vant'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

const PAY_QR_URL = '/wx-pay.png'

const router = useRouter()
const tab = ref<'register' | 'progress'>('register')

const username = ref('')
const nickname = ref('')
const password = ref('')
const phone = ref('')
const email = ref('')
const showPassword = ref(false)
const screenshot = ref('')
const previewVisible = ref(false)
const loading = ref(false)

const progressUsername = ref('')
const progress = ref<RegistrationProgress | null>(null)
const progressLoading = ref(false)
/** 是否已经查询过一次，用于区分「未查询」与「无申请」 */
const queried = ref(false)

const statusText = computed(() => {
  if (!progress.value) return ''
  return { pending: '待审批', approved: '已通过', rejected: '已拒绝' }[progress.value.status]
})
const statusIcon = computed(() => {
  if (!progress.value) return 'clock-o'
  return { pending: 'clock-o', approved: 'checked', rejected: 'close' }[progress.value.status]
})

function goBack() {
  router.replace('/login')
}

/** 付款截图：压缩到最长边 720px 的 JPEG base64，控制 D1 单行大小 */
async function onPickScreenshot(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    screenshot.value = await compressImage(file)
  } catch {
    showToast('图片读取失败，请换一张试试')
  } finally {
    ;(event.target as HTMLInputElement).value = ''
  }
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const max = 720
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.72))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('load failed'))
    }
    img.src = url
  })
}

async function submit() {
  if (loading.value) return
  if (!username.value.trim() || !nickname.value.trim() || !password.value) {
    showToast('请填写用户名、昵称和密码')
    return
  }
  if (!screenshot.value) {
    showToast('请上传付款截图')
    return
  }
  loading.value = true
  try {
    await register({
      username: username.value.trim(),
      nickname: nickname.value.trim(),
      password: password.value,
      phone: phone.value.trim() || undefined,
      email: email.value.trim() || undefined,
      paymentScreenshot: screenshot.value,
    })
    showToast('注册申请已提交，请等待审批')
    progressUsername.value = username.value.trim()
    tab.value = 'progress'
    await queryProgress()
  } catch {
    // 错误提示已由请求拦截器统一处理
  } finally {
    loading.value = false
  }
}

async function queryProgress() {
  if (progressLoading.value) return
  const name = progressUsername.value.trim()
  progressLoading.value = true
  try {
    // 默认按当前 userToken 查询，填写用户名时按用户名查询
    progress.value = await getRegisterStatus(name || undefined)
  } catch {
    progress.value = null
  } finally {
    progressLoading.value = false
    queried.value = true
  }
}

/** 切到审批进度：默认直接用当前账号查询一次 */
function openProgress() {
  tab.value = 'progress'
  if (!queried.value && !progressLoading.value)
    queryProgress()
}

/** 服务端时间为 UTC（YYYY-MM-DD HH:MM:SS），补 Z 后按本地时区展示 */
function formatTime(value: string) {
  if (!value) return ''
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
</script>

<style scoped>
.register-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #fff;
}

.register-header {
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

.register-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  padding: 18px 24px calc(30px + env(safe-area-inset-bottom));
  overflow-y: auto;
}

.tab-bar {
  display: flex;
  gap: 6px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);

  .tab-item {
    flex: 1;
    padding: 9px 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    font-size: 13px;
    cursor: pointer;

    &.active {
      background: rgba(255, 255, 255, 0.16);
      color: #fff;
    }
  }
}

.register-form,
.progress-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.05);

  .field-icon {
    font-size: 18px;
    color: rgba(255, 255, 255, 0.45);
  }

  input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: #fff;
    font-size: 14px;

    &::placeholder {
      color: rgba(255, 255, 255, 0.3);
    }
  }
}

.eye-btn {
  padding: 4px;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.45);
  font-size: 17px;
  cursor: pointer;
}

.pay-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
}

.pay-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;

  .pay-title {
    font-size: 14px;
    font-weight: 600;
  }

  .pay-amount {
    color: #f2c97d;
    font-size: 20px;
    font-weight: 600;
  }
}

.pay-tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.5);
}

.pay-qr {
  width: 180px;
  height: 180px;
  border-radius: 12px;
  background: #fff;
  object-fit: contain;
}

.upload-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px 0;
  border: 1px dashed rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  cursor: pointer;

  &.uploaded {
    border-style: solid;
    border-color: rgba(103, 194, 58, 0.5);
    color: #67c23a;
  }
}

.shot-preview {
  position: relative;
  width: 100%;
  cursor: zoom-in;

  img {
    width: 100%;
    max-height: 220px;
    border-radius: 12px;
    object-fit: cover;
  }

  .preview-tip {
    position: absolute;
    right: 8px;
    bottom: 8px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    font-size: 11px;
    color: rgba(255, 255, 255, 0.8);
  }
}

.submit-btn {
  padding: 14px 0;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, #7c5cff, #a78bfa);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
  }
}

.form-note {
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
}

.progress-empty {
  margin: 0;
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.35);
}

.progress-card {
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
}

.progress-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-bottom: 14px;
  font-size: 18px;
  font-weight: 600;

  &.pending {
    color: #f2c97d;
  }
  &.approved {
    color: #67c23a;
  }
  &.rejected {
    color: #ff6b81;
  }
}

.progress-info {
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 0;
    font-size: 13px;

    & + li {
      border-top: 1px solid rgba(255, 255, 255, 0.07);
    }

    span:first-child {
      color: rgba(255, 255, 255, 0.5);
    }

    .reject-reason {
      color: #ff6b81;
      text-align: right;
    }
  }
}

.progress-hint {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 12px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.6);

  &.success {
    color: #67c23a;
  }
}
</style>
