<template>
  <div class="admin-page">
    <header class="admin-header">
      <button type="button" class="back-btn" @click="goBack">
        <van-icon name="arrow-left" />
      </button>
      <span class="header-title">注册审批</span>
      <button type="button" class="refresh-btn" @click="loadList">
        <van-icon name="replay" />
      </button>
    </header>

    <main class="admin-main">
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
          placeholder="搜索用户名 / 昵称 / 手机号 / 邮箱"
          @keyup.enter="loadList"
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

      <div class="date-row">
        <button
          v-for="item in DATE_RANGES"
          :key="item.value"
          type="button"
          class="date-chip"
          :class="{ active: dateRange === item.value }"
          @click="changeDateRange(item.value)"
        >
          {{ item.label }}
        </button>
        <button
          v-if="dateRange === 'custom'"
          type="button"
          class="date-chip custom"
          @click="openDatePicker"
        >
          {{ customDateLabel || '选择日期' }}
        </button>
        <button
          v-if="dateRange !== 'all'"
          type="button"
          class="date-reset"
          @click="changeDateRange('all')"
        >
          <van-icon name="replay" />
        </button>
      </div>

      <van-loading v-if="loading" class="page-loading" color="#a78bfa" size="24" />

      <p v-else-if="!list.length" class="empty-tip">
        暂无相关申请
      </p>

      <section v-for="item in list" :key="item.id" class="request-card">
        <div class="card-head">
          <div class="user-info">
            <span class="nickname">{{ item.nickname }}</span>
            <span class="username">@{{ item.username }}</span>
          </div>
          <span class="status-tag" :class="item.status">{{ statusLabel(item.status) }}</span>
        </div>

        <ul class="info-list">
          <li><span>用户 ID</span><span>{{ item.user_id }}</span></li>
          <li v-if="item.phone"><span>手机号</span><span>{{ item.phone }}</span></li>
          <li v-if="item.email"><span>邮箱</span><span>{{ item.email }}</span></li>
          <li><span>申请时间</span><span>{{ formatTime(item.create_time) }}</span></li>
          <li v-if="item.review_time">
            <span>审批时间</span><span>{{ formatTime(item.review_time) }}</span>
          </li>
          <li v-if="item.status === 'rejected' && item.reject_reason">
            <span>拒绝原因</span><span class="reject-reason">{{ item.reject_reason }}</span>
          </li>
        </ul>

        <div v-if="item.payment_screenshot" class="shot-row" @click="previewShot(item)">
          <img :src="item.payment_screenshot" alt="付款截图">
          <span class="shot-tip">付款截图 · 点击放大</span>
        </div>

        <div v-if="item.status === 'pending'" class="action-row">
          <button
            type="button"
            class="action-btn reject"
            :disabled="actingId === item.id"
            @click="openReject(item)"
          >
            拒绝
          </button>
          <button
            type="button"
            class="action-btn approve"
            :disabled="actingId === item.id"
            @click="approve(item)"
          >
            {{ actingId === item.id ? '处理中…' : '通过并开通' }}
          </button>
        </div>

        <div v-if="item.status === 'approved'" class="action-row">
          <button type="button" class="action-btn vip" @click="openVip(item)">
            <van-icon name="gem-o" />
            VIP 管理
          </button>
        </div>
      </section>
    </main>

    <!-- 拒绝原因弹层 -->
    <van-popup v-model:show="rejectVisible" position="bottom" round teleport="body" class="reject-popup">
      <div class="reject-wrap">
        <div class="reject-head">
          <span>拒绝 @{{ rejectTarget?.username }} 的申请</span>
          <button type="button" class="reject-cancel" @click="rejectVisible = false">取消</button>
        </div>
        <textarea
          v-model="rejectReason"
          class="reject-input"
          rows="3"
          maxlength="100"
          placeholder="填写拒绝原因（将展示给申请人）"
        />
        <button type="button" class="confirm-reject" :disabled="actingId !== null" @click="confirmReject">
          确认拒绝
        </button>
      </div>
    </van-popup>

    <van-image-preview v-model:show="previewVisible" :images="previewImages" />

    <!-- 自定义日期范围选择器 -->
    <van-popup v-model:show="datePickerVisible" position="bottom" round teleport="body" class="reject-popup">
      <div class="reject-wrap">
        <div class="reject-head">
          <span>选择申请日期范围</span>
          <button type="button" class="reject-cancel" @click="datePickerVisible = false">关闭</button>
        </div>
        <van-date-picker
          v-model="customFromDate"
          title="起始日期"
          :min-date="minDate"
          :max-date="maxDate"
          @confirm="onCustomFromConfirm"
        />
        <van-date-picker
          v-model="customToDate"
          title="结束日期"
          :min-date="customFromDate.length ? new Date(Number(customFromDate[0]), Number(customFromDate[1]) - 1, Number(customFromDate[2])) : minDate"
          :max-date="maxDate"
          @confirm="onCustomToConfirm"
        />
        <button type="button" class="confirm-reject" @click="applyCustomDate">
          应用日期范围
        </button>
      </div>
    </van-popup>

    <!-- VIP 调级 + 变更记录弹层 -->
    <van-popup v-model:show="vipVisible" position="bottom" round teleport="body" class="reject-popup">
      <div class="reject-wrap">
        <div class="reject-head">
          <span>@{{ vipTarget?.username }} 的 VIP 管理</span>
          <button type="button" class="reject-cancel" @click="vipVisible = false">关闭</button>
        </div>

        <div class="vip-level-row">
          <button
            v-for="n in 9"
            :key="n"
            type="button"
            class="vip-level-btn"
            :class="{ active: vipLevel === n }"
            @click="vipLevel = n"
          >
            {{ n }}
          </button>
        </div>
        <input v-model="vipRemark" class="vip-remark" maxlength="50" placeholder="调级备注（选填）">
        <button type="button" class="confirm-reject vip-confirm" :disabled="vipSaving" @click="submitVip">
          {{ vipSaving ? '提交中…' : `调整为 VIP${vipLevel}（永久）` }}
        </button>

        <div class="vip-record-title">
          变更记录
        </div>
        <van-loading v-if="vipRecordsLoading" color="#a78bfa" size="18" />
        <p v-else-if="!vipRecords.length" class="vip-record-empty">
          暂无记录
        </p>
        <ul v-else class="vip-record-list">
          <li v-for="record in vipRecords" :key="record.id">
            <span class="record-change">VIP{{ record.from_level }} → VIP{{ record.to_level }}</span>
            <span class="record-remark">{{ record.remark || record.change_type }}</span>
            <span class="record-time">{{ formatTime(record.create_time) }}</span>
          </li>
        </ul>
      </div>
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { getAdminRegistrations, getUserVipRecords, reviewRegistration, setUserVipLevel } from '@/api/user'
import type { VipRecord } from '@/api/user'
import { LOGIN_RETURN_OWNER_KEY } from '@/constants/auth'
import { useUserProfileStore } from '@/stores/userProfile'
import type { RegistrationItem, RegistrationStatus } from '@/types/user'
import { showToast } from 'vant'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const STATUS_TABS = [
  { label: '待审批', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已拒绝', value: 'rejected' },
  { label: '全部', value: 'all' },
]

const DATE_RANGES = [
  { label: '全部', value: 'all' },
  { label: '今天', value: 'today' },
  { label: '近 7 天', value: '7d' },
  { label: '近 30 天', value: '30d' },
  { label: '自定义', value: 'custom' },
]

const router = useRouter()
const profileStore = useUserProfileStore()

const status = ref('pending')
const keyword = ref('')
const dateRange = ref('all')
const customFrom = ref('')
const customTo = ref('')
const customDateLabel = computed(() => {
  if (!customFrom.value || !customTo.value) return ''
  return `${customFrom.value} ~ ${customTo.value}`
})

const datePickerVisible = ref(false)
const customFromDate = ref<string[]>([])
const customToDate = ref<string[]>([])
const minDate = new Date(2020, 0, 1)
const maxDate = new Date()

const list = ref<RegistrationItem[]>([])
const loading = ref(false)
const actingId = ref<number | null>(null)

const rejectVisible = ref(false)
const rejectTarget = ref<RegistrationItem | null>(null)
const rejectReason = ref('')

const previewVisible = ref(false)
const previewImages = ref<string[]>([])

const vipVisible = ref(false)
const vipTarget = ref<RegistrationItem | null>(null)
const vipLevel = ref(1)
const vipRemark = ref('')
const vipSaving = ref(false)
const vipRecords = ref<VipRecord[]>([])
const vipRecordsLoading = ref(false)

/** 打开 VIP 管理：默认选中下一级，同时加载变更记录 */
function openVip(item: RegistrationItem) {
  vipTarget.value = item
  vipLevel.value = 1
  vipRemark.value = ''
  vipVisible.value = true
  loadVipRecords()
}

async function loadVipRecords() {
  const target = vipTarget.value
  if (!target) return
  vipRecordsLoading.value = true
  try {
    vipRecords.value = await getUserVipRecords(target.username)
    const currentLevel = Number(vipRecords.value[0]?.to_level) || 1
    vipLevel.value = Math.min(9, currentLevel + 1)
  } catch {
    vipRecords.value = []
  } finally {
    vipRecordsLoading.value = false
  }
}

async function submitVip() {
  const target = vipTarget.value
  if (!target || vipSaving.value) return
  vipSaving.value = true
  try {
    await setUserVipLevel(target.username, vipLevel.value, vipRemark.value.trim() || undefined)
    showToast(`已调整为 VIP${vipLevel.value}`)
    vipRemark.value = ''
    await loadVipRecords()
  } catch {
    // 错误提示由拦截器处理
  } finally {
    vipSaving.value = false
  }
}

/** 返回首页时切回「我的」页 */
function goBack() {
  sessionStorage.setItem(LOGIN_RETURN_OWNER_KEY, '1')
  router.replace('/')
}

function statusLabel(value: RegistrationStatus) {
  return { pending: '待审批', approved: '已通过', rejected: '已拒绝' }[value]
}

/** 请求序号：切换筛选后只接受最后一次请求的结果，避免旧数据回填 */
let loadSeq = 0

/** 根据日期范围计算 from / to 参数（YYYY-MM-DD） */
function resolveDateRange(): { from?: string; to?: string } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const now = new Date()
  switch (dateRange.value) {
    case 'today': {
      const t = fmt(now)
      return { from: t, to: t }
    }
    case '7d': {
      const from = new Date(now.getTime() - 6 * 24 * 3600 * 1000)
      return { from: fmt(from), to: fmt(now) }
    }
    case '30d': {
      const from = new Date(now.getTime() - 29 * 24 * 3600 * 1000)
      return { from: fmt(from), to: fmt(now) }
    }
    case 'custom':
      return customFrom.value && customTo.value
        ? { from: customFrom.value, to: customTo.value }
        : {}
    default:
      return {}
  }
}

async function loadList() {
  const seq = ++loadSeq
  loading.value = true
  try {
    const dateParams = resolveDateRange()
    const data = await getAdminRegistrations({
      status: status.value,
      keyword: keyword.value.trim() || undefined,
      from: dateParams.from,
      to: dateParams.to,
    })
    if (seq === loadSeq) list.value = data
  } catch {
    if (seq === loadSeq) list.value = []
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

function changeStatus(value: string) {
  if (status.value === value) return
  status.value = value
  list.value = []
  loadList()
}

function clearKeyword() {
  keyword.value = ''
  list.value = []
  loadList()
}

function changeDateRange(value: string) {
  if (dateRange.value === value) return
  if (value === 'custom') {
    openDatePicker()
    return
  }
  customFrom.value = ''
  customTo.value = ''
  dateRange.value = value
  list.value = []
  loadList()
}

function openDatePicker() {
  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  customFromDate.value = [
    String(today.getFullYear()),
    pad(today.getMonth() + 1),
    pad(today.getDate()),
  ]
  customToDate.value = [...customFromDate.value]
  datePickerVisible.value = true
}

function onCustomFromConfirm({ selectedValues }: { selectedValues: string[] }) {
  customFromDate.value = selectedValues
}

function onCustomToConfirm({ selectedValues }: { selectedValues: string[] }) {
  customToDate.value = selectedValues
}

function applyCustomDate() {
  const pad = (n: string | number) => String(n).padStart(2, '0')
  const fmt = (arr: string[]) =>
    `${arr[0]}-${pad(arr[1])}-${pad(arr[2])}`
  if (customFromDate.value.length < 3 || customToDate.value.length < 3) {
    showToast('请选择完整的日期')
    return
  }
  customFrom.value = fmt(customFromDate.value)
  customTo.value = fmt(customToDate.value)
  datePickerVisible.value = false
  dateRange.value = 'custom'
  list.value = []
  loadList()
}

async function approve(item: RegistrationItem) {
  if (actingId.value !== null) return
  actingId.value = item.id
  try {
    await reviewRegistration(item.id, 'approve')
    showToast('已通过，账号已生效')
    list.value = list.value.filter(row => row.id !== item.id || status.value === 'all')
    if (status.value === 'all') loadList()
  } catch {
    // 错误提示由拦截器处理
  } finally {
    actingId.value = null
  }
}

function openReject(item: RegistrationItem) {
  rejectTarget.value = item
  rejectReason.value = ''
  rejectVisible.value = true
}

async function confirmReject() {
  const target = rejectTarget.value
  if (!target || actingId.value !== null) return
  actingId.value = target.id
  try {
    await reviewRegistration(target.id, 'reject', rejectReason.value.trim() || undefined)
    showToast('已拒绝该申请')
    rejectVisible.value = false
    loadList()
  } catch {
    // 错误提示由拦截器处理
  } finally {
    actingId.value = null
  }
}

function previewShot(item: RegistrationItem) {
  if (!item.payment_screenshot) return
  previewImages.value = [item.payment_screenshot]
  previewVisible.value = true
}

/** 服务端时间为 UTC，补 Z 后按本地时区展示 */
function formatTime(value: string) {
  if (!value) return ''
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  if (Number.isNaN(date.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
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
.admin-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #fff;
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(10px + env(safe-area-inset-top)) 14px 0;

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

.admin-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  padding: 16px 16px calc(30px + env(safe-area-inset-bottom));
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

.page-loading {
  align-self: center;
  margin-top: 40px;
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

    &::placeholder { color: rgba(255, 255, 255, 0.3); }
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

.date-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;

  .date-chip {
    padding: 6px 14px;
    border: 0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
    cursor: pointer;

    &.active {
      background: linear-gradient(135deg, #7c5cff, #a78bfa);
      color: #fff;
    }

    &.custom {
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .date-reset {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    cursor: pointer;
    margin-left: auto;
  }
}

.empty-tip {
  margin: 40px 0 0;
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
}

.request-card {
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;

  .user-info {
    display: flex;
    align-items: baseline;
    gap: 8px;

    .nickname {
      font-size: 15px;
      font-weight: 600;
    }

    .username {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.45);
    }
  }

  .status-tag {
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 11px;

    &.pending { background: rgba(242, 201, 125, 0.15); color: #f2c97d; }
    &.approved { background: rgba(103, 194, 58, 0.15); color: #67c23a; }
    &.rejected { background: rgba(255, 107, 129, 0.15); color: #ff6b81; }
  }
}

.info-list {
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 6px 0;
    font-size: 12px;

    span:first-child { color: rgba(255, 255, 255, 0.45); }
    .reject-reason { color: #ff6b81; text-align: right; }
  }
}

.shot-row {
  position: relative;
  margin-top: 8px;
  cursor: zoom-in;

  img {
    width: 100%;
    max-height: 200px;
    border-radius: 12px;
    object-fit: cover;
  }

  .shot-tip {
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

.action-row {
  display: flex;
  gap: 10px;
  margin-top: 12px;

  .action-btn {
    flex: 1;
    padding: 10px 0;
    border: 0;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;

    &:disabled { opacity: 0.5; }

    &.reject {
      background: rgba(255, 107, 129, 0.12);
      color: #ff6b81;
    }

    &.approve {
      background: linear-gradient(135deg, #7c5cff, #a78bfa);
      color: #fff;
    }

    &.vip {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid rgba(242, 201, 125, 0.3);
      background: linear-gradient(135deg, rgba(242, 201, 125, 0.2), rgba(167, 139, 250, 0.16));
      color: #f2c97d;
    }
  }
}

.reject-popup {
  background: var(--popup-bg-raised, #141625) !important;
}

.reject-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 16px calc(20px + env(safe-area-inset-bottom));
}

.reject-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 600;

  .reject-cancel {
    padding: 4px 8px;
    border: 0;
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    font-size: 13px;
    cursor: pointer;
  }
}

.reject-input {
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  font-size: 13px;
  resize: none;

  &::placeholder { color: rgba(255, 255, 255, 0.3); }
}

.confirm-reject {
  padding: 12px 0;
  border: 0;
  border-radius: 12px;
  background: #ff6b81;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:disabled { opacity: 0.5; }

  &.vip-confirm {
    background: linear-gradient(135deg, #b8893e, #8b6bd8);
  }
}

.vip-level-row {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 6px;
}

.vip-level-btn {
  min-width: 0;
  padding: 8px 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
  cursor: pointer;

  &.active {
    border-color: rgba(242, 201, 125, 0.5);
    background: rgba(242, 201, 125, 0.18);
    color: #f2c97d;
    font-weight: 600;
  }
}

.vip-remark {
  width: 100%;
  box-sizing: border-box;
  padding: 11px 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  outline: none;
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
  font-size: 13px;

  &::placeholder { color: rgba(255, 255, 255, 0.3); }
}

.vip-record-title {
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 13px;
  font-weight: 600;
}

.vip-record-empty {
  margin: 8px 0;
  text-align: center;
  color: rgba(255, 255, 255, 0.35);
  font-size: 12px;
}

.vip-record-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;

  li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 10px;
    padding: 10px 12px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.045);
    font-size: 11px;
  }

  .record-change {
    color: #f2c97d;
    font-weight: 600;
  }

  .record-remark {
    overflow: hidden;
    color: rgba(255, 255, 255, 0.65);
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .record-time {
    grid-column: 1 / -1;
    color: rgba(255, 255, 255, 0.35);
  }
}
</style>
