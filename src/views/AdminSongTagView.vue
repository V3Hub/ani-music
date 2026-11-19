<template>
  <div class="tag-page">
    <header class="tag-header">
      <button type="button" class="icon-btn" @click="goBack">
        <van-icon name="arrow-left" />
      </button>
      <span class="header-title">歌曲标签</span>
      <button type="button" class="icon-btn" @click="loadList">
        <van-icon name="replay" />
      </button>
    </header>

    <main class="tag-main">
      <div class="search-row">
        <van-icon name="search" class="search-icon" />
        <input
          v-model="keyword"
          class="search-input"
          placeholder="搜索标签 / 歌曲 / 歌手 / 用户"
          @keyup.enter="loadList"
        >
        <button v-if="keyword" type="button" class="search-clear" @click="clearKeyword">
          <van-icon name="clear" />
        </button>
      </div>

      <div class="tool-row">
        <span class="total-tip">共 {{ total }} 条标签记录</span>
      </div>

      <van-loading v-if="loading" class="page-loading" color="#a78bfa" size="24" />

      <p v-else-if="!list.length" class="empty-tip">
        暂无歌曲标签
      </p>

      <section v-for="item in list" :key="item.id" class="tag-card">
        <div class="card-head">
          <span class="tag-name">#{{ item.tag }}</span>
          <span class="create-time">{{ formatTime(item.create_time) }}</span>
        </div>

        <ul class="info-list">
          <li>
            <span>歌曲</span>
            <span>{{ item.title || `歌曲 ${item.song_id}` }}<template v-if="item.artist"> - {{ item.artist }}</template></span>
          </li>
          <li><span>用户</span><span>{{ item.username || `ID ${item.user_id}` }}</span></li>
        </ul>

        <div class="action-row">
          <button
            type="button"
            class="action-btn danger"
            :disabled="actingId === item.id"
            @click="removeTag(item)"
          >
            删除该记录
          </button>
          <button
            type="button"
            class="action-btn batch"
            :disabled="actingId === item.id"
            @click="removeTagByName(item.tag)"
          >
            删除同名标签
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
import { deleteAdminSongTag, deleteAdminSongTagByName, getAdminSongTags } from '@/api/song-tag'
import { LOGIN_RETURN_OWNER_KEY } from '@/constants/auth'
import { useUserProfileStore } from '@/stores/userProfile'
import type { AdminSongTagItem } from '@/types/songTag'
import { showConfirmDialog, showToast } from 'vant'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const PAGE_SIZE = 20

const router = useRouter()
const profileStore = useUserProfileStore()

const keyword = ref('')
const list = ref<AdminSongTagItem[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const loadingMore = ref(false)
const actingId = ref<number | null>(null)

const hasMore = computed(() => list.value.length < total.value)

/** 请求序号：切换搜索后只接受最后一次请求的结果 */
let loadSeq = 0

async function fetchPage(nextPage: number) {
  const seq = ++loadSeq
  if (nextPage === 1)
    loading.value = true
  else
    loadingMore.value = true
  try {
    const data = await getAdminSongTags({
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

function clearKeyword() {
  keyword.value = ''
  loadList()
}

/** 删除单条标签记录 */
async function removeTag(item: AdminSongTagItem) {
  try {
    await showConfirmDialog({ title: '删除标签', message: `确认删除「${item.tag}」这条记录？` })
  } catch {
    return
  }
  if (actingId.value !== null)
    return
  actingId.value = item.id
  try {
    await deleteAdminSongTag(item.id)
    list.value = list.value.filter(row => row.id !== item.id)
    total.value = Math.max(0, total.value - 1)
    showToast('已删除')
  } catch {
    // 错误提示由请求层统一处理
  } finally {
    actingId.value = null
  }
}

/** 删除某个标签名的全部记录 */
async function removeTagByName(tag: string) {
  try {
    await showConfirmDialog({
      title: '删除同名标签',
      message: `将删除所有歌曲上的「${tag}」标签，确认继续？`,
    })
  } catch {
    return
  }
  try {
    const data = await deleteAdminSongTagByName(tag)
    showToast(`已删除 ${data?.count ?? 0} 条`)
    loadList()
  } catch {
    // 错误提示由请求层统一处理
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
.tag-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #fff;
}

.tag-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(10px + env(safe-area-inset-top)) 14px 0;

  .icon-btn {
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

.tag-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  padding: 16px 16px calc(30px + env(safe-area-inset-bottom));
  overflow-y: auto;
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

.tag-card {
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  .tag-name {
    overflow: hidden;
    padding: 3px 12px;
    border-radius: 999px;
    background: rgba(167, 139, 250, 0.18);
    color: #a78bfa;
    font-size: 13px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .create-time {
    flex-shrink: 0;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.4);
  }
}

.info-list {
  margin: 10px 0 0;
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

    &.danger {
      background: rgba(255, 107, 129, 0.12);
      color: #ff6b81;
    }

    &.batch {
      background: rgba(242, 201, 125, 0.14);
      color: #f2c97d;
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
