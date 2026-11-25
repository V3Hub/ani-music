<template>
  <div class="log-page">
    <header class="log-header">
      <button type="button" class="back-btn" @click="goBack">
        <van-icon name="arrow-left" />
      </button>
      <span class="header-title">错误日志</span>
      <button type="button" class="refresh-btn" @click="loadList">
        <van-icon name="replay" />
      </button>
    </header>

    <main class="log-main">
      <div class="filter-bar">
        <button
          v-for="item in STATUS_TABS"
          :key="item.value"
          type="button"
          class="filter-item"
          :class="{ active: status === item.value }"
          @click="changeStatus(item.value)"
        >
          {{ item.label }}
        </button>
      </div>

      <div class="search-row">
        <van-icon name="search" class="search-icon" />
        <input
          v-model="keyword"
          class="search-input"
          placeholder="搜索接口 / 错误信息 / 用户名"
          @keyup.enter="loadList"
        >
        <button v-if="keyword" type="button" class="search-clear" @click="clearKeyword">
          <van-icon name="clear" />
        </button>
      </div>

      <div class="tool-row">
        <span class="total-tip">共 {{ total }} 条</span>
        <button type="button" class="clear-btn" @click="clearResolved">
          清除已处理
        </button>
      </div>

      <van-loading v-if="loading" class="page-loading" color="#a78bfa" size="24" />

      <p v-else-if="!list.length" class="empty-tip">
        暂无错误日志
      </p>

      <section v-for="item in list" :key="item.id" class="log-card">
        <div class="card-head">
          <span class="method-tag" :class="item.method.toLowerCase()">{{ item.method }}</span>
          <span class="log-url" :title="item.url">{{ item.url }}</span>
          <span class="state-tag" :class="item.status">
            {{ item.status === 'new' ? '未处理' : '已处理' }}
          </span>
        </div>

        <p class="log-message">
          {{ item.message || '接口请求失败' }}
        </p>

        <ul class="info-list">
          <li>
            <span>错误类型</span>
            <span class="status-code" :class="{ server: item.http_status >= 500 }">
              {{ statusLabel(item) }}
            </span>
          </li>
          <li><span>用户</span><span>{{ item.username || `匿名（ID ${item.user_id || '-'}）` }}</span></li>
          <li><span>上报时间</span><span>{{ formatTime(item.create_time) }}</span></li>
          <li v-if="detailOf(item)?.page"><span>页面</span><span>{{ detailOf(item)?.page }}</span></li>
          <li v-if="detailOf(item)?.clientTime">
            <span>客户端时间</span><span>{{ formatTime(detailOf(item)!.clientTime!) }}</span>
          </li>
        </ul>

        <button type="button" class="detail-toggle" @click="toggleDetail(item)">
          {{ expanded[item.id] ? '收起详情' : '查看详情' }}
          <van-icon :name="expanded[item.id] ? 'arrow-up' : 'arrow-down'" />
        </button>

        <div v-if="expanded[item.id]" class="detail-box">
          <div class="detail-block">
            <span class="detail-label">请求参数</span>
            <pre>{{ formatJson(detailOf(item)?.request) }}</pre>
          </div>
          <div class="detail-block">
            <span class="detail-label">响应内容</span>
            <pre>{{ formatJson(detailOf(item)?.response) }}</pre>
          </div>
        </div>

        <div class="action-row">
          <button
            type="button"
            class="action-btn toggle"
            :disabled="actingId === item.id"
            @click="toggleResolved(item)"
          >
            {{ item.status === 'resolved' ? '标记未处理' : '标记已处理' }}
          </button>
          <button
            type="button"
            class="action-btn danger"
            :disabled="actingId === item.id"
            @click="removeLog(item)"
          >
            删除
          </button>
        </div>
      </section>

      <button
        v-if="hasMore && !loading"
        type="button"
        class="load-more"
        :disabled="loadingMore"
        @click="loadMore"
      >
        {{ loadingMore ? '加载中…' : '加载更多' }}
      </button>
    </main>
  </div>
</template>

<script setup lang="ts">
import { clearErrorLogs, deleteErrorLog, getAdminErrorLogs, updateErrorLogStatus } from '@/api/error-log'
import { LOGIN_RETURN_OWNER_KEY } from '@/constants/auth'
import { useUserProfileStore } from '@/stores/userProfile'
import type { ErrorLogItem, ErrorLogStatus } from '@/types/errorLog'
import { showConfirmDialog, showToast } from 'vant'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const STATUS_TABS = [
  { label: '全部', value: 'all' },
  { label: '未处理', value: 'new' },
  { label: '已处理', value: 'resolved' },
] as const

const PAGE_SIZE = 20

const router = useRouter()
const profileStore = useUserProfileStore()

const status = ref<'all' | ErrorLogStatus>('new')
const keyword = ref('')
const list = ref<ErrorLogItem[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const loadingMore = ref(false)
const actingId = ref<number | null>(null)
/** 展开详情的日志 id 集合 */
const expanded = ref<Record<number, boolean>>({})

const hasMore = computed(() => list.value.length < total.value)

/** 请求序号：切换筛选后只接受最后一次请求的结果 */
let loadSeq = 0

async function fetchPage(nextPage: number) {
  const seq = ++loadSeq
  if (nextPage === 1)
    loading.value = true
  else
    loadingMore.value = true
  try {
    const data = await getAdminErrorLogs({
      status: status.value,
      keyword: keyword.value.trim() || undefined,
      page: nextPage,
      pageSize: PAGE_SIZE,
    })
    if (seq !== loadSeq)
      return
    list.value = nextPage === 1 ? data.list : [...list.value, ...data.list]
    total.value = data.total
    page.value = data.page
  } catch {
    if (seq === loadSeq && nextPage === 1) {
      list.value = []
      total.value = 0
    }
  } finally {
    if (seq === loadSeq) {
      loading.value = false
      loadingMore.value = false
    }
  }
}

function loadList() {
  return fetchPage(1)
}

function loadMore() {
  if (loadingMore.value || !hasMore.value)
    return
  return fetchPage(page.value + 1)
}

function changeStatus(value: 'all' | ErrorLogStatus) {
  if (status.value === value)
    return
  status.value = value
  list.value = []
  total.value = 0
  loadList()
}

function clearKeyword() {
  keyword.value = ''
  loadList()
}

/** 标记已处理 / 未处理；当前筛选不再匹配时从列表移除 */
async function toggleResolved(item: ErrorLogItem) {
  if (actingId.value !== null)
    return
  const next = item.status === 'resolved' ? 'new' : 'resolved'
  actingId.value = item.id
  try {
    await updateErrorLogStatus(item.id, next)
    item.status = next
    showToast(next === 'resolved' ? '已标记为已处理' : '已标记为未处理')
    if (status.value !== 'all' && status.value !== next) {
      list.value = list.value.filter(row => row.id !== item.id)
      total.value = Math.max(0, total.value - 1)
    }
  } catch {
    // 错误提示由拦截器处理
  } finally {
    actingId.value = null
  }
}

async function removeLog(item: ErrorLogItem) {
  try {
    await showConfirmDialog({ title: '删除日志', message: '删除后不可恢复，确认删除这条日志？' })
  } catch {
    return
  }
  if (actingId.value !== null)
    return
  actingId.value = item.id
  try {
    await deleteErrorLog(item.id)
    list.value = list.value.filter(row => row.id !== item.id)
    total.value = Math.max(0, total.value - 1)
    showToast('已删除')
  } catch {
    // 错误提示由拦截器处理
  } finally {
    actingId.value = null
  }
}

async function clearResolved() {
  try {
    await showConfirmDialog({ title: '清除已处理', message: '将删除全部已处理的错误日志，确认继续？' })
  } catch {
    return
  }
  try {
    await clearErrorLogs('resolved')
    showToast('已清除已处理日志')
    loadList()
  } catch {
    // 错误提示由拦截器处理
  }
}

function toggleDetail(item: ErrorLogItem) {
  expanded.value = { ...expanded.value, [item.id]: !expanded.value[item.id] }
}

interface ErrorDetail {
  request?: unknown
  response?: unknown
  page?: string
  clientTime?: string
}

/** 解析上报时写入的 detail JSON，解析失败按空处理 */
function detailOf(item: ErrorLogItem): ErrorDetail | null {
  if (!item.detail)
    return null
  try {
    return JSON.parse(item.detail) as ErrorDetail
  } catch {
    return null
  }
}

/** 业务错误展示为「业务错误 + code」，HTTP 错误展示状态码 */
function statusLabel(item: ErrorLogItem) {
  if (item.http_status === 200 && item.biz_code !== null && item.biz_code !== undefined)
    return `业务错误 ${item.biz_code}`
  return `HTTP ${item.http_status || '异常'}`
}

function formatJson(value: unknown) {
  if (value === undefined || value === null)
    return '-'
  if (typeof value === 'string')
    return value || '-'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/** 服务端时间为 UTC，补 Z 后按本地时区展示 */
function formatTime(value: string) {
  if (!value) return ''
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function goBack() {
  sessionStorage.setItem(LOGIN_RETURN_OWNER_KEY, '1')
  router.replace('/')
}

onMounted(async () => {
  // 直接刷新本页时用户资料尚未拉取，先取一次再判断管理员
  if (!profileStore.isAdmin)
    await profileStore.fetchProfile()
  // 非管理员直接退回（接口侧也会做 403 校验，双保险）
  if (!profileStore.isAdmin) {
    showToast('无管理员权限')
    router.replace('/')
    return
  }
  loadList()
})
</script>

<style scoped>
.log-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #fff;
}

.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;

  .back-btn,
  .refresh-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    color: #fff;
    font-size: 17px;
    cursor: pointer;
  }

  .header-title {
    font-size: 15px;
    opacity: 0.8;
  }
}

.log-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  padding: 16px 16px 30px;
  overflow-y: auto;
}

.filter-bar {
  display: flex;
  gap: 6px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);

  .filter-item {
    flex: 1;
    padding: 8px 0;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    cursor: pointer;

    &.active {
      background: rgba(255, 255, 255, 0.16);
      color: #fff;
    }
  }
}

.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);

  .search-icon {
    flex-shrink: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.4);
  }

  .search-input {
    flex: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: #fff;
    font-size: 13px;

    &::placeholder {
      color: rgba(255, 255, 255, 0.3);
    }
  }

  .search-clear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    cursor: pointer;
  }
}

.tool-row {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .total-tip {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
  }

  .clear-btn {
    padding: 5px 12px;
    border: 1px solid rgba(255, 107, 129, 0.35);
    border-radius: 999px;
    background: rgba(255, 107, 129, 0.1);
    color: #ff6b81;
    font-size: 11px;
    cursor: pointer;
  }
}

.page-loading {
  align-self: center;
  margin-top: 40px;
}

.empty-tip {
  margin: 40px 0 0;
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
}

.log-card {
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;

  .method-tag {
    flex-shrink: 0;
    padding: 2px 7px;
    border-radius: 6px;
    background: rgba(167, 139, 250, 0.18);
    color: #a78bfa;
    font-size: 10px;
    font-weight: 600;

    &.post {
      background: rgba(103, 194, 58, 0.16);
      color: #67c23a;
    }
    &.put {
      background: rgba(242, 201, 125, 0.16);
      color: #f2c97d;
    }
    &.delete {
      background: rgba(255, 107, 129, 0.16);
      color: #ff6b81;
    }
  }

  .log-url {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .state-tag {
    flex-shrink: 0;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;

    &.new {
      background: rgba(242, 201, 125, 0.15);
      color: #f2c97d;
    }
    &.resolved {
      background: rgba(103, 194, 58, 0.15);
      color: #67c23a;
    }
  }
}

.log-message {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: #ff8fa0;
  word-break: break-all;
}

.info-list {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 6px 0;
    font-size: 12px;

    span:first-child {
      flex-shrink: 0;
      color: rgba(255, 255, 255, 0.45);
    }
    span:last-child {
      text-align: right;
      word-break: break-all;
    }
    .status-code {
      color: #f2c97d;

      &.server {
        color: #ff6b81;
      }
    }
  }
}

.detail-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  margin-top: 8px;
  padding: 7px 0;
  border: 0;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
  cursor: pointer;
}

.detail-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.detail-block {
  display: flex;
  flex-direction: column;
  gap: 4px;

  .detail-label {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.45);
  }

  pre {
    margin: 0;
    padding: 10px;
    max-height: 220px;
    overflow: auto;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.35);
    color: rgba(255, 255, 255, 0.72);
    font-size: 11px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-all;
  }
}

.action-row {
  display: flex;
  gap: 10px;
  margin-top: 10px;

  .action-btn {
    flex: 1;
    padding: 9px 0;
    border: 0;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;

    &:disabled {
      opacity: 0.5;
    }

    &.toggle {
      background: rgba(167, 139, 250, 0.16);
      color: #a78bfa;
    }

    &.danger {
      background: rgba(255, 107, 129, 0.12);
      color: #ff6b81;
    }
  }
}

.load-more {
  margin-top: 4px;
  padding: 11px 0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: transparent;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
  }
}
</style>
