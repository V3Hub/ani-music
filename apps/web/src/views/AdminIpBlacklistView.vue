<template>
  <div class="admin-page">
    <header class="admin-header">
      <button type="button" class="back-btn" @click="goBack">
        <van-icon name="arrow-left" />
      </button>
      <span class="header-title">IP 黑名单</span>
      <button type="button" class="refresh-btn" @click="loadList">
        <van-icon name="replay" />
      </button>
    </header>

    <main class="admin-main">
      <!-- 拉黑表单 -->
      <section class="form-card">
        <input
          v-model="form.ip"
          class="ip-input"
          placeholder="要拉黑的 IP，如 1.2.3.4"
          maxlength="64"
        >
        <div class="dur-row">
          <button
            v-for="opt in banOptions"
            :key="opt.days"
            type="button"
            class="dur-chip"
            :class="{ active: form.days === opt.days }"
            @click="form.days = opt.days"
          >
            {{ opt.label }}
          </button>
        </div>
        <input
          v-model="form.reason"
          class="ip-input"
          placeholder="拉黑原因（选填）"
          maxlength="100"
        >
        <button
          type="button"
          class="submit-btn"
          :class="{ 'is-disabled': submitting || !form.ip.trim() }"
          :disabled="submitting || !form.ip.trim()"
          @click="submit"
        >
          {{ submitting ? '提交中…' : '加入黑名单' }}
        </button>
      </section>

      <van-loading v-if="loading" class="page-loading" color="#a78bfa" size="24" />

      <p v-else-if="!list.length" class="empty-tip">
        暂无被拉黑的 IP
      </p>

      <section v-for="item in list" :key="item.ip" class="ip-card">
        <div class="ip-info">
          <span class="ip-text" :class="{ expired: item.expired }">{{ item.ip }}</span>
          <span class="ip-meta">
            {{ item.expired ? '已过期' : item.expire_time ? `解封时间 ${item.expire_time.slice(0, 16)}` : '永久' }}
          </span>
          <span v-if="item.reason" class="ip-reason">{{ item.reason }}</span>
        </div>
        <button type="button" class="remove-btn" @click="remove(item.ip)">
          移除
        </button>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { addIpBlacklist, getIpBlacklist, removeIpBlacklist } from '@/api/admin-user'
import type { AdminIpItem } from '@/api/admin-user'
import { LOGIN_RETURN_OWNER_KEY } from '@/constants/auth'
import { showToast } from 'vant'
import { useRouter } from 'vue-router'
import { ref } from 'vue'

const router = useRouter()

const loading = ref(false)
const submitting = ref(false)
const list = ref<AdminIpItem[]>([])
const form = ref({ ip: '', reason: '', days: 0 })

/** 拉黑时长选项，days = 0 永久 */
const banOptions = [
  { label: '永久', days: 0 },
  { label: '90 天', days: 90 },
  { label: '30 天', days: 30 },
  { label: '7 天', days: 7 },
]

async function loadList() {
  loading.value = true
  try {
    list.value = await getIpBlacklist()
  } catch {
    // request 层统一 Toast
  } finally {
    loading.value = false
  }
}

async function submit() {
  const ip = form.value.ip.trim()
  if (!ip || submitting.value) return
  submitting.value = true
  try {
    await addIpBlacklist(ip, form.value.reason.trim(), form.value.days)
    showToast(form.value.days > 0 ? `已拉黑 ${form.value.days} 天` : '已永久拉黑')
    form.value = { ip: '', reason: '', days: 0 }
    await loadList()
  } catch {
    // request 层统一 Toast
  } finally {
    submitting.value = false
  }
}

async function remove(ip: string) {
  try {
    await removeIpBlacklist(ip)
    showToast('已移除')
    await loadList()
  } catch {
    // request 层统一 Toast
  }
}

function goBack() {
  sessionStorage.setItem(LOGIN_RETURN_OWNER_KEY, '1')
  if (window.history.length > 1) {
    router.back()
    return
  }
  router.replace('/')
}

loadList()
</script>

<style scoped>
.admin-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #fff;
}

.admin-header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  flex-shrink: 0;

  .back-btn,
  .refresh-btn {
    width: 34px;
    height: 34px;
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
    flex: 1;
    font-size: 15px;
    text-align: center;
    opacity: 0.8;
  }
}

.admin-main {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px 24px;
  overflow-y: auto;
}

.form-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
}

.ip-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  font: inherit;
  font-size: 13px;
  outline: none;

  &::placeholder {
    opacity: 0.4;
  }
}

.dur-row {
  display: flex;
  gap: 6px;
}

.dur-chip {
  flex: 1;
  padding: 6px 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  opacity: 0.7;
  cursor: pointer;

  &.active {
    border-color: rgba(127, 90, 240, 0.7);
    background: rgba(127, 90, 240, 0.22);
    opacity: 1;
  }
}

.submit-btn {
  padding: 9px 0;
  border: 0;
  border-radius: 10px;
  background: #7f5af0;
  color: #fff;
  font-size: 13px;
  cursor: pointer;

  &.is-disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
}

.page-loading {
  margin-top: 40%;
  display: block;
}

.empty-tip {
  padding: 40px 0;
  text-align: center;
  font-size: 12px;
  opacity: 0.4;
}

.ip-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
}

.ip-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;

  .ip-text {
    font-size: 13px;
    font-weight: 600;

    &.expired {
      opacity: 0.45;
      text-decoration: line-through;
    }
  }

  .ip-meta {
    font-size: 11px;
    opacity: 0.45;
  }

  .ip-reason {
    font-size: 11.5px;
    color: #ff8da1;
  }
}

.remove-btn {
  flex-shrink: 0;
  padding: 5px 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-size: 11.5px;
  opacity: 0.75;
  cursor: pointer;
}
</style>
