<template>
  <div class="admin-page">
    <header class="admin-header">
      <button type="button" class="back-btn" @click="goBack">
        <van-icon name="arrow-left" />
      </button>
      <span class="header-title">用户管理</span>
      <button type="button" class="refresh-btn" @click="loadList(1)">
        <van-icon name="replay" />
      </button>
    </header>

    <main class="admin-main">
      <!-- 搜索 + 筛选 -->
      <div class="toolbar">
        <div class="search-row">
          <van-icon name="search" class="search-icon" />
          <input
            v-model="keyword"
            class="search-input"
            placeholder="用户名 / 昵称 / 手机 / 邮箱"
            @keyup.enter="loadList(1)"
          >
          <button
            v-if="keyword"
            type="button"
            class="search-clear"
            @click="clearKeyword"
          >
            <van-icon name="clear" />
          </button>
        </div>
        <div class="status-tabs">
          <button
            v-for="s in statusTabs"
            :key="s.value"
            type="button"
            class="status-tab"
            :class="{ active: activeStatus === s.value }"
            @click="switchStatus(s.value)"
          >
            {{ s.label }}
          </button>
        </div>
      </div>

      <van-loading v-if="loading" class="page-loading" color="#a78bfa" size="24" />

      <p v-else-if="!list.length" class="empty-tip">
        暂无用户
      </p>

      <section
        v-for="item in list"
        :key="item.id"
        class="user-card"
      >
        <img class="avatar" :src="item.avatar_url" alt="">
        <div class="info">
          <div class="info-head">
            <span class="nickname">
              {{ item.nickname || (`@${item.username}`) }}
            </span>
            <span
              v-if="item.is_admin"
              class="tag admin"
            >管理员</span>
            <span
              v-if="item.status === 'banned'"
              class="tag banned"
            >已封禁</span>
            <span
              v-else-if="item.vip_level > 0"
              class="tag vip"
            >VIP {{ item.vip_level }}</span>
          </div>
          <div class="info-meta">
            <span>ID {{ item.id }}</span>
            <span>·</span>
            <span>{{ item.username }}</span>
          </div>
          <div v-if="item.status === 'banned' && item.ban_reason" class="ban-reason">
            封禁原因：{{ item.ban_reason }}
          </div>
          <div v-if="item.status === 'banned'" class="ban-reason">
            {{ item.ban_until ? `解封时间：${item.ban_until.slice(0, 16)}` : '永久封禁' }}
          </div>
          <span class="create-time">注册 {{ item.create_time?.slice(0, 16) || '-' }}</span>
        </div>
        <button
          type="button"
          class="more-btn"
          @click="openActions($event, item)"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            <circle cx="8" cy="3" r="1.4" />
            <circle cx="8" cy="8" r="1.4" />
            <circle cx="8" cy="13" r="1.4" />
          </svg>
        </button>
      </section>

      <div v-if="list.length && list.length >= pageSize" class="more-area">
        <button
          type="button"
          class="more-btn-big"
          :disabled="loadingMore || !hasMore"
          @click="loadList(page + 1)"
        >
          {{ loadingMore ? '加载中…' : hasMore ? '加载更多' : '到底了' }}
        </button>
      </div>
    </main>

    <!-- 操作菜单 -->
    <van-popup
      v-model:show="menuVisible"
      position="bottom"
      round
      :style="{ background: 'transparent' }"
      teleport="body"
    >
      <div class="action-sheet">
        <p class="target-line">
          {{ target?.nickname || (`@${target?.username}`) }}（ID {{ target?.id }}）
        </p>
        <template v-if="target">
          <button
            v-if="target.status === 'banned'"
            type="button"
            class="action-item"
            @click="actionUnban(target)"
          >
            解封
          </button>
          <button
            v-else
            type="button"
            class="action-item danger"
            @click="openBanDialog(target)"
          >
            封禁
          </button>
          <button type="button" class="action-item" @click="openResetDialog(target)">
            重置密码
          </button>
          <button
            v-if="!target.is_admin"
            type="button"
            class="action-item danger"
            @click="confirmDelete(target)"
          >
            删除用户
          </button>
        </template>
        <button type="button" class="action-item cancel" @click="menuVisible = false">
          取消
        </button>
      </div>
    </van-popup>

    <!-- 封禁弹框：原因 + 时长 -->
    <van-dialog
      v-model:show="banDialog.show"
      title="封禁用户"
      show-cancel-button
      :before-close="onBanConfirm"
    >
      <template #default>
        <div class="ban-form">
          <div class="dur-row">
            <button
              v-for="opt in banOptions"
              :key="opt.days"
              type="button"
              class="dur-chip"
              :class="{ active: banDialog.days === opt.days }"
              @click="banDialog.days = opt.days"
            >
              {{ opt.label }}
            </button>
          </div>
          <textarea
            v-model="banDialog.reason"
            class="ban-reason-input"
            rows="2"
            maxlength="100"
            placeholder="选填，让用户知道为什么被封"
          />
        </div>
      </template>
    </van-dialog>

    <!-- 重置密码弹框 -->
    <van-dialog
      v-model:show="resetDialog.show"
      title="重置密码"
      show-cancel-button
      :before-close="onResetConfirm"
    >
      <template #default>
        <textarea
          v-model="resetDialog.password"
          class="ban-reason-input"
          rows="1"
          maxlength="64"
          placeholder="不填则重置为 123456"
        />
      </template>
    </van-dialog>
  </div>
</template>

<script setup lang="ts">
import {
  banUser,
  deleteUser,
  getAdminUsers,
  resetUserPassword,
  unbanUser,

} from '@/api/admin-user'
import type { AdminUserItem } from '@/api/admin-user'
import { LOGIN_RETURN_OWNER_KEY } from '@/constants/auth'
import { showConfirmDialog, showToast } from 'vant'
import { useRouter } from 'vue-router'
import { ref, computed, watch } from 'vue'

const router = useRouter()

const loading = ref(false)
const loadingMore = ref(false)
const list = ref<AdminUserItem[]>([])
const page = ref(1)
const pageSize = 20
const total = ref(0)
const keyword = ref('')
const activeStatus = ref<'all' | 'active' | 'banned'>('all')

const menuVisible = ref(false)
const target = ref<AdminUserItem | null>(null)

const banDialog = ref({ show: false, reason: '', days: 0 })
const resetDialog = ref({ show: false, password: '' })
/** 封禁时长选项，days = 0 永久 */
const banOptions = [
  { label: '永久', days: 0 },
  { label: '90 天', days: 90 },
  { label: '30 天', days: 30 },
  { label: '7 天', days: 7 },
]

const statusTabs = [
  { label: '全部', value: 'all' as const },
  { label: '正常', value: 'active' as const },
  { label: '封禁', value: 'banned' as const },
]

const hasMore = computed(() => list.value.length < total.value)

watch(menuVisible, (v) => {
  if (!v) target.value = null
})

async function loadList(p = 1) {
  const append = p > 1
  if (append) loadingMore.value = true
  else loading.value = true
  page.value = p
  try {
    const data = await getAdminUsers({
      page: p,
      pageSize,
      keyword: keyword.value.trim() || undefined,
      status: activeStatus.value,
    })
    if (append)
      list.value = [...list.value, ...data.list]
    else
      list.value = data.list
    total.value = data.total
  } catch {
    // request 层统一 Toast
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function clearKeyword() {
  keyword.value = ''
  loadList(1)
}

function switchStatus(s: 'all' | 'active' | 'banned') {
  if (s === activeStatus.value) return
  activeStatus.value = s
  loadList(1)
}

function openActions(e: MouseEvent, item: AdminUserItem) {
  e.stopPropagation()
  target.value = item
  menuVisible.value = true
}

function goBack() {
  sessionStorage.setItem(LOGIN_RETURN_OWNER_KEY, '1')
  if (window.history.length > 1) {
    router.back()
    return
  }
  router.replace('/')
}

async function actionUnban(item: AdminUserItem) {
  menuVisible.value = false
  try {
    await unbanUser(item.id)
    showToast('已解封')
    loadList(page.value)
  } catch { /* request 已 toast */ }
}

function openBanDialog(item: AdminUserItem) {
  banDialog.value = { show: true, reason: '', days: 0 }
  target.value = item
}

async function onBanConfirm(action: string) {
  if (action !== 'confirm' || !target.value) return true
  try {
    const { reason, days } = banDialog.value
    await banUser(target.value.id, reason.trim(), days)
    showToast(days > 0 ? `已封禁 ${days} 天` : '已永久封禁')
    banDialog.value = { show: false, reason: '', days: 0 }
    menuVisible.value = false
    loadList(page.value)
    return true
  } catch {
    return false
  }
}

function openResetDialog(item: AdminUserItem) {
  resetDialog.value = { show: true, password: '' }
  target.value = item
}

async function onResetConfirm(action: string) {
  if (action !== 'confirm' || !target.value) return true
  try {
    const res = await resetUserPassword(target.value.id, resetDialog.value.password.trim() || undefined)
    const newPwd = res?.password || '123456'
    showToast(`密码已重置为 ${newPwd}`)
    resetDialog.value = { show: false, password: '' }
    menuVisible.value = false
    return true
  } catch {
    return false
  }
}

async function confirmDelete(item: AdminUserItem) {
  menuVisible.value = false
  try {
    await showConfirmDialog({
      title: '删除用户',
      message: `确定删除「${item.nickname || item.username}」的全部数据吗？评论/收藏/歌单/通知都会一起清除，不可恢复。`,
      confirmButtonText: '删除',
      confirmButtonColor: '#ff5c7c',
    })
  } catch {
    return
  }
  try {
    await deleteUser(item.id)
    showToast('已删除')
    loadList(page.value)
  } catch { /* request 已 toast */ }
}

loadList(1)
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
    font-size: 15px;
    opacity: 0.8;
    flex: 1;
    text-align: center;
  }
}

.admin-main {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  padding: 10px 14px 24px;
  overflow-y: auto;
}

.toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.05);

  .search-icon {
    opacity: 0.5;
    font-size: 14px;
    flex-shrink: 0;
  }
  .search-input {
    flex: 1;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 13px;
    outline: none;
    min-width: 0;
  }
  .search-clear {
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    opacity: 0.4;
    flex-shrink: 0;
    padding: 0;
  }
}

.status-tabs {
  display: flex;
  gap: 6px;
}

.status-tab {
  flex: 1;
  padding: 6px 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  font-size: 12px;
  cursor: pointer;

  &.active {
    background: rgba(127, 90, 240, 0.25);
    border-color: rgba(127, 90, 240, 0.6);
  }
}

.page-loading {
  margin-top: 40%;
  display: block;
}
.empty-tip {
  text-align: center;
  font-size: 12px;
  opacity: 0.4;
  padding: 40px 0;
}

.user-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
}

.avatar {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  flex-shrink: 0;
  object-fit: cover;
}

.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.nickname {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 3px;
  font-size: 10px;
  line-height: 16px;
  color: #fff;
  &.admin {
    background: rgba(127, 90, 240, 0.6);
  }
  &.banned {
    background: rgba(255, 92, 124, 0.55);
  }
  &.vip {
    background: rgba(255, 170, 60, 0.55);
  }
}

.info-meta {
  font-size: 11px;
  opacity: 0.45;
  display: flex;
  gap: 4px;
}

.ban-reason {
  font-size: 11.5px;
  color: #ff8da1;
  line-height: 1.4;
}

.create-time {
  font-size: 10.5px;
  opacity: 0.35;
}

.more-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
  opacity: 0.7;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.more-area {
  padding: 8px 0 12px;
}
.more-btn-big {
  width: 100%;
  padding: 10px 0;
  border: 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  font-size: 12px;
  cursor: pointer;
  opacity: 0.8;
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

/* action sheet */
.action-sheet {
  background: var(--popup-bg-raised);
  border-radius: 18px 18px 0 0;
  padding: 8px 12px 24px;

  .target-line {
    margin: 4px 0 10px;
    text-align: center;
    font-size: 12px;
    opacity: 0.5;
  }

  .action-item {
    width: 100%;
    padding: 14px 0;
    border: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: transparent;
    color: inherit;
    font-size: 14px;
    cursor: pointer;

    &.danger {
      color: #ff8da1;
    }
    &.cancel {
      opacity: 0.55;
      border-bottom: 0;
      margin-top: 6px;
    }
  }
}

.ban-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 4px 2px;
}

.dur-row {
  display: flex;
  gap: 6px;
}

.dur-chip {
  flex: 1;
  padding: 6px 0;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 999px;
  background: transparent;
  color: #666;
  font-size: 12px;
  cursor: pointer;

  &.active {
    border-color: #7f5af0;
    background: rgba(127, 90, 240, 0.12);
    color: #7f5af0;
  }
}

.ban-reason-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  resize: none;
  box-sizing: border-box;
}
</style>
