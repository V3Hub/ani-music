<template>
  <van-popup
    :show="visible"
    position="bottom"
    round
    teleport="body"
    class="add-to-playlist-popup"
    @update:show="emit('update:visible', $event)"
    @closed="reset"
  >
    <div class="add-to-playlist" :style="dragStyle" v-on="handlers">
      <div class="drag-bar" />
      <div class="sheet-title">
        添加到歌单
      </div>

      <div class="target-list">
        <button type="button" class="target-item" @click="emit('create')">
          <div class="tile tile-icon">
            <van-icon name="plus" size="22" />
          </div>
          <span class="target-name">创建歌单</span>
        </button>

        <button type="button" class="target-item" @click="emit('select', 'favorite')">
          <div class="tile" :class="{ 'tile-cover': favoriteCover }">
            <van-image v-if="favoriteCover" width="100%" height="100%" fit="cover" :src="favoriteCover">
              <template #error>
                <img class="cover-fallback" :src="LOGO_URL" alt="">
              </template>
            </van-image>
            <van-icon v-else name="like" size="20" />
          </div>
          <div class="target-meta">
            <span class="target-name">我喜欢的</span>
            <span class="target-count">{{ favoriteCount }}首</span>
          </div>
        </button>

        <button
          v-for="item in playlists"
          :key="item.id"
          type="button"
          class="target-item"
          @click="emit('select', item.id)"
        >
          <div class="tile tile-cover">
            <van-image width="100%" height="100%" fit="cover" :src="item.pic || LOGO_URL">
              <template #error>
                <img class="cover-fallback" :src="LOGO_URL" alt="">
              </template>
            </van-image>
          </div>
          <div class="target-meta">
            <span class="target-name">{{ item.name }}</span>
            <span v-if="item.count != null" class="target-count">{{ item.count }}首</span>
          </div>
        </button>
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import type { PlaylistItem } from '@/types/music'
import { useSwipeDownClose } from '@/composables/useSwipeDownClose'

defineProps<{
  visible: boolean
  playlists: PlaylistItem[]
  favoriteCount: number
  /** 我喜欢的歌单封面（取第一首歌的封面），为空时显示心形图标 */
  favoriteCover?: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'select', target: number | 'favorite'): void
  (e: 'create'): void
}>()

const LOGO_URL = '/qs.svg'

// 下拉关闭：整卡跟手移动（含弹层背景），列表区域保持原生滚动
const { dragStyle, handlers, reset } = useSwipeDownClose({
  onClose: () => emit('update:visible', false),
  threshold: 110,
  ignoreSelector: '.target-list',
  lockDirection: true,
})
</script>

<style lang="scss" scoped>
.add-to-playlist-popup {
  /* 背景交给内容层：下拉拖动时背景跟内容一起移动 */
  background: transparent !important;
}

.add-to-playlist {
  padding: 4px 20px 20px;
  color: var(--theme-text, #fff);
  /* 三级弹层：比歌曲操作弹层再亮一层，避免两层背景一样分不清 */
  background: var(--popup-bg-elevated);
  border-radius: inherit;
}

.drag-bar {
  width: 40px;
  height: 4px;
  margin: 8px auto 0;
  border-radius: 999px;
  /* 跟随主题文字色：深色背景为浅色条，浅色背景为深色条，两者都可见 */
  background: currentColor;
  opacity: 0.3;
}

.sheet-title {
  padding: 12px 0 16px;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
}

.target-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 55vh;
  overflow-y: auto;
}

.target-item {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 16px;
  padding: 0;
  border: none;
  color: inherit;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.tile {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  overflow: hidden;
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.2);
}

.tile-cover {
  background: none;
}

.cover-fallback {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 14px;
  object-fit: contain;
  background: rgba(128, 128, 128, 0.16);
}

.target-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;

  .target-name {
    overflow: hidden;
    font-size: 15px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .target-count {
    font-size: 12px;
    opacity: 0.55;
  }
}
</style>
