<template>
  <div class="owner-panel">
    <div class="owner-header">
      <div class="listen-time">今日已听 {{ listenTime }}</div>
      <div class="header-actions">
        <span v-if="loggedIn" class="notice-wrap" @click="emit('openNotifications')">
          <van-icon class="notice-btn" name="bell" size="22" />
          <span v-if="unreadCount > 0" class="notice-dot" />
        </span>
        <van-icon class="settings-btn" name="setting-o" size="22" @click="emit('openSettings')" />
      </div>
    </div>
    <div class="owner-content">
      <div class="user-info" @click="handleUserClick">
        <van-image
          round
          width="48"
          height="48"
          :src="avatarSrc"
        />
        <div class="user-meta">
          <div class="user-name">
            <span>{{ displayName }}</span>
            <VipBadge :level="profileStore.vipLevel" />
          </div>
          <div class="user-hint">{{ hintText }}</div>
        </div>
        <van-icon class="login-arrow" name="arrow" />
      </div>
      <div class="section-title">
        创建的歌单
        <div class="create-btn" @click="emit('createPlaylist')">
          <van-icon name="plus" />
          创建
        </div>
      </div>
      <ul class="playlist-list">
        <li @click="emit('openFavorite')">
          <div class="cover-wrap">
            <div v-if="playingPlaylist?.source === 'favorite'" class="wave-overlay">
              <WaveBox :playing="isPlaying" />
            </div>
            <van-image width="72" height="72" radius="8" fit="cover" :src="coverOf(favoriteSongs[0]?.pic)">
              <template #error>
                <img class="cover-fallback" :src="LOGO_URL" alt="">
              </template>
            </van-image>
          </div>
          <div class="item-meta">
            <div>我喜欢的</div>
            <div>{{ favoriteSongs.length }}首</div>
          </div>
        </li>
        <li @click="emit('openHistory')">
          <div class="cover-wrap">
            <div v-if="playingPlaylist?.source === 'playRecord'" class="wave-overlay">
              <WaveBox :playing="isPlaying" />
            </div>
            <van-image width="72" height="72" radius="8" fit="cover" :src="coverOf(playHistory[0]?.pic)">
              <template #error>
                <img class="cover-fallback" :src="LOGO_URL" alt="">
              </template>
            </van-image>
          </div>
          <div class="item-meta">
            <div>历史播放</div>
            <div>{{ playHistory.length }}首</div>
          </div>
        </li>
        <li
          v-for="item in playlists"
          :key="item.id"
          @click="emit('openPlaylist', item.id)"
        >
          <div class="cover-wrap">
            <div
              v-if="playingPlaylist?.source === 'playlist' && playingPlaylist?.id === item.id"
              class="wave-overlay"
            >
              <WaveBox :playing="isPlaying" />
            </div>
            <van-image width="72" height="72" radius="8" fit="cover" :src="coverOf(item.pic)">
              <template #error>
                <img class="cover-fallback" :src="LOGO_URL" alt="">
              </template>
            </van-image>
          </div>
          <div class="item-meta">
            <div>{{ item.name }}</div>
            <div>{{ item.count }}首</div>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PlaylistItem, Song } from '@/types/music'
import { getUnreadNotificationCount } from '@/api/notification'
import WaveBox from '@/components/waveBox/WaveBox.vue'
import VipBadge from '@/components/common/VipBadge.vue'
import { useUserProfileStore } from '@/stores/userProfile'
import { resolveAvatarOrDefault } from '@/utils/avatar'
import { resolveDisplayName } from '@/utils/user-token'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  userToken: string
  /** 是否已登录：决定点击用户信息跳登录页还是账号详情页 */
  loggedIn: boolean
  /** 登录账号的昵称，未登录为空 */
  nickname: string
  /** 登录账号的头像（数据库 base64 / data URL），未登录为空 */
  avatar: string
  playlists: PlaylistItem[]
  playHistory: Song[]
  favoriteSongs: Song[]
  /** 当前队列所属歌单：只有它在播放时才显示波纹 */
  playingPlaylist: PlaylistItem | null
  isPlaying: boolean
  /** 今日听歌时长文案 */
  listenTime: string
}>()

const emit = defineEmits<{
  (e: 'openFavorite'): void
  (e: 'openHistory'): void
  (e: 'openPlaylist', id: number): void
  (e: 'createPlaylist'): void
  (e: 'openSettings'): void
  (e: 'openNotifications'): void
  (e: 'openLogin'): void
  (e: 'openAccount'): void
}>()

const profileStore = useUserProfileStore()

/** 未读消息数：登录态就绪后拉取，铃铛角标展示 */
const unreadCount = ref(0)

watch(() => props.loggedIn, async (logged) => {
  if (!logged) {
    unreadCount.value = 0
    return
  }
  try {
    unreadCount.value = await getUnreadNotificationCount()
  } catch {
    // 未读数失败不影响页面，错误由拦截器提示
  }
}, { immediate: true })

/** 没有上传头像时回退到按 userToken 生成的默认头像 */
const avatarSrc = computed(() => resolveAvatarOrDefault(props.avatar, props.userToken))
const displayName = computed(() => resolveDisplayName({
  nickname: props.nickname,
  userToken: props.userToken,
}))
const hintText = computed(() => (props.loggedIn ? '查看账号详情' : '点击登录 / 注册'))

/** 未登录去登录页，已登录进入账号详情页 */
function handleUserClick() {
  if (props.loggedIn)
    emit('openAccount')
  else
    emit('openLogin')
}

/** 项目 logo，歌单没有封面时兜底 */
const LOGO_URL = '/qs.svg'

function coverOf(pic?: string) {
  return pic || LOGO_URL
}
</script>

<style lang="scss" scoped>
.owner-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 0 20px;
  // flex item 占据剩余空间，内容多时自己滚动
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  // 文字颜色跟随封面主题色计算出的前景色，自动适配深/浅背景
  color: var(--theme-text, #fff);

  .owner-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 5px;

    .listen-time {
      font-size: 13px;
      opacity: 0.6;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .notice-btn,
    .settings-btn {
      color: var(--theme-text, #fff);
      cursor: pointer;
      opacity: 0.9;
    }

    .notice-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
      cursor: pointer;
    }
    .notice-dot {
      position: absolute;
      right: -1px;
      bottom: 0;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #ff4d4f;
      box-shadow: 0 0 0 2px var(--theme-background, #0a0b16);
    }
  }

  .owner-content {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 5px;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;

    .login-arrow {
      flex-shrink: 0;
      margin-left: auto;
      font-size: 14px;
      opacity: 0.4;
    }

    .user-meta {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;

      .user-name {
        display: flex;
        align-items: center;
        gap: 8px;
        overflow: hidden;
        font-size: 16px;
        font-weight: 500;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .user-hint {
        font-size: 12px;
        opacity: 0.55;
      }
    }
  }

  .section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 14px;
    opacity: 0.85;

    .create-btn {
      display: flex;
      align-items: center;
      gap: 2px;
      font-size: 13px;
      cursor: pointer;
    }
  }

  .cover-fallback {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 16px;
    object-fit: contain;
    background: rgba(255, 255, 255, 0.05);
  }

  .playlist-list {
    display: flex;
    flex-direction: column;
    gap: 20px;
    margin: 0;
    padding: 0;
    list-style: none;

    li {
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;

      .cover-wrap {
        position: relative;
        flex-shrink: 0;

        .wave-overlay {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 2;
        }
      }

      .item-meta {
        display: flex;
        flex-direction: column;
        gap: 6px;

        > div:first-child {
          font-size: 15px;
        }

        > div:last-child {
          font-size: 12px;
          opacity: 0.55;
        }
      }
    }
  }
}
</style>
