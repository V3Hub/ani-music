<template>
  <div class="player-stage">
    <Swiper
      :key="queueKey"
      :initial-slide="initialSlide"
      direction="vertical"
      :loop="player.playList.length > 2"
      :slides-per-view="1"
      :space-between="0"
      :allow-touch-move="true"
      style="width: 100%; height: 100%"
      @swiper="onSwiperReady"
      @slide-change-transition-end="onSlideChange"
    >
      <SwiperSlide v-for="(song, index) in player.playList" :key="song.id">
        <!-- 只渲染当前歌曲附近的 slide，避免整个队列的封面/进度条占满 WebView 内存 -->
        <div v-if="isNear(index)" class="slide-content">
          <div class="cover-box">
            <van-image width="100%" height="100%" :src="song.pic ?? ''" fit="cover" />
          </div>

          <div
            :ref="(el: any) => registerLyricContainer(song.id, el as HTMLElement | null)"
            class="lyric-scroll"
          >
            <div class="lyric-container">
              <div
                v-for="(line, lineIndex) in linesOf(song)"
                :key="lineIndex"
                class="lyric-line"
                :class="{ active: isCurrent(song) && currentLine === lineIndex }"
              >
                {{ line }}
              </div>
              <van-empty
                v-if="!linesOf(song).length"
                image="musical-note"
                description="暂时没找到歌词"
              />
            </div>
          </div>

          <div class="song-title">
            <h3>{{ song.title }}</h3>
            <!-- 当前歌曲标签：无标签时展示占位，点击进入标签面板 -->
            <button
              v-if="isCurrent(song) && songTags[String(song.id)]"
              type="button"
              class="song-tags"
              @click="emit('openTags', song)"
            >
              <template v-if="songTags[String(song.id)].length">
                <span v-for="item in visibleTags(song)" :key="item.tag" class="tag tag-solid">#{{ item.tag }}</span>
                <span v-if="songTags[String(song.id)].length > 2" class="tag tag-outline">
                  +{{ songTags[String(song.id)].length - 2 }}
                </span>
              </template>
              <span v-else class="tag tag-outline tag-empty">
                <van-icon name="add" size="10" />
                无标签
              </span>
            </button>
          </div>

          <div class="artist-row">
            <span class="artist">{{ song.singer }}</span>
          </div>

          <div class="action-row">
            <div class="action-item" @click="emit('favorite', song.id)">
              <van-icon
                :name="isSongFavorite(song) ? 'like' : 'like-o'"
                size="27"
                :color="isSongFavorite(song) ? '#FF5C7C' : '#FFFFFF'"
                class="action-icon"
              />
              <span class="action-count">{{ song.favoriteCount ?? 0 }}</span>
            </div>
            <div class="action-item" @click="emit('openComment', song)">
              <van-icon name="chat-o" size="27" color="#FFFFFF" />
              <span class="action-count">{{ commentCounts[String(song.id)] ?? 0 }}</span>
            </div>
            <div class="action-item" @click="emit('share', song)">
              <van-icon name="share-o" size="27" color="#FFFFFF" />
              <span class="action-count">{{ shareCounts[String(song.id)] ?? 0 }}</span>
            </div>
            <div class="action-right">
              <svg
                class="more-icon"
                width="22"
                height="22"
                viewBox="0 0 22 22"
                @click="emit('openQueue')"
              >
                <circle cx="11" cy="4" r="2" fill="#FFFFFF" />
                <circle cx="11" cy="11" r="2" fill="#FFFFFF" />
                <circle cx="11" cy="18" r="2" fill="#FFFFFF" />
              </svg>
            </div>
          </div>
          <div class="music-progress swiper-no-swiping">
            <!-- 缓冲进度：已缓存部分 -->
            <div
              class="buffer-bar"
              :style="{ width: `${isCurrent(song) ? player.bufferedPercent : 0}%` }"
            />
            <van-slider
              v-model="sliderValue"
              :min="0"
              :max="player.duration || 1"
              :step="1"
              :readonly="!isCurrent(song)"
              bar-height="3"
              button-size="14"
              active-color="#fff"
              inactive-color="transparent"
              @update:model-value="onSliderUpdate"
              @drag-end="onSliderDragEnd"
            />
          </div>
        </div>
        <div v-else class="slide-content slide-placeholder" />
      </SwiperSlide>
    </Swiper>
  </div>
</template>

<script setup lang="ts">
import type { Song } from '@/types/music'
import type { SongTagItem } from '@/types/songTag'
import { usePlaybackControl } from '@/composables/player/usePlaybackControl'
import { useLyricSync, resolveLyricLines } from '@/composables/player/useLyricSync'
import { useSongCarousel } from '@/composables/player/useSongCarousel'
import { usePlayerStore } from '@/stores/player'
import { Swiper, SwiperSlide } from 'swiper/vue'
import 'swiper/css'
import { ref, watch } from 'vue'

const props = defineProps<{
  favoriteSongs: Song[]
  shareCounts: Record<string, number>
  commentCounts: Record<string, number>
  /** 歌曲 id -> 标签列表，仅当前歌曲展示 */
  songTags: Record<string, SongTagItem[]>
}>()

const emit = defineEmits<{
  (e: 'favorite', id?: string | number): void
  (e: 'share', song: Song): void
  (e: 'openComment', song: Song): void
  (e: 'openQueue'): void
  (e: 'openTags', song: Song): void
}>()

/** 标题旁最多展示 2 个标签，其余折叠为 +N */
function visibleTags(song: Song): SongTagItem[] {
  return (props.songTags[String(song.id)] || []).slice(0, 2)
}

const player = usePlayerStore()
const { queueKey, initialSlide, onSwiperReady, onSlideChange } = useSongCarousel()
const { currentLine, registerLyricContainer } = useLyricSync()
const { onSeekEnd, onSeeking } = usePlaybackControl()

/** 收藏状态：播放时从歌曲详情获取，未获取前回退到收藏列表 */
function isSongFavorite(song: Song): boolean {
  if (typeof song.favorite === 'boolean')
    return song.favorite
  return props.favoriteSongs.some(item => item.id === song.id)
}

/** 该 slide 是否为当前播放的歌曲 */
function isCurrent(song: Song): boolean {
  return player.currentSong?.id === song.id
}

/**
 * 只渲染当前歌曲附近的 slide：
 * Swiper 会把整个队列都挂进 DOM，全量渲染封面和进度条会占满 iOS WebView 内存，
 * 滑几首后进程被系统回收，表现就是白屏 / 整页刷新
 */
const RENDER_WINDOW = 2
function isNear(index: number) {
  const total = player.playList.length
  // loop 模式首尾相接：首尾两页始终渲染，避免 Swiper 克隆出来的滑页是空白
  if (total > 2 && (index === 0 || index === total - 1))
    return true
  const diff = Math.abs(index - player.currentIndex)
  // loop 模式下首尾相邻，取环形距离
  return total > 2 ? Math.min(diff, total - diff) <= RENDER_WINDOW : diff <= RENDER_WINDOW
}

/** 歌词行缓存：避免每次渲染都重新 map 一遍数组 */
const lyricLineCache = new WeakMap<Song, { list: Song['lyricList'], lines: string[] }>()
function linesOf(song: Song) {
  const cached = lyricLineCache.get(song)
  if (cached && cached.list === song.lyricList)
    return cached.lines
  const lines = resolveLyricLines(song)
  lyricLineCache.set(song, { list: song.lyricList, lines })
  return lines
}

/** 进度条本地值：拖拽时不被 timeupdate 覆盖 */
const sliderValue = ref(0)
const dragging = ref(false)

watch(() => player.currentTime, (t) => {
  if (!dragging.value)
    sliderValue.value = t
})

watch(() => player.currentSong?.id, () => {
  dragging.value = false
  sliderValue.value = 0
})

function onSliderUpdate(val: number) {
  dragging.value = true
  sliderValue.value = val
  onSeeking(val)
}

function onSliderDragEnd() {
  dragging.value = false
  onSeekEnd(sliderValue.value)
}
</script>

<style lang="scss" scoped>
.player-stage {
  position: relative; // 定位由外层 .player-stage-absolute 负责
  width: 100%;
  height: 100%;
  // 手势全交给 Swiper：禁止浏览器纵向滚动与下拉刷新，避免滑动时页面被整页刷新
  touch-action: none;
  overscroll-behavior: contain;

  :deep(.swiper) {
    touch-action: none;
  }

  .slide-content {
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 35px 20px 65px;
    box-sizing: border-box;
    overflow: hidden;
  }

  .cover-box {
    position: relative;
    // 自适应剩余空间：只占 flex 剩余高度，高度不足时等比缩小
    flex: 1 1 0;
    min-height: 0;
    // 最大边长与内容宽度一致，保证始终是正方形
    max-height: calc(100vw - 40px);
    max-width: 100%;
    aspect-ratio: 1 / 1;
    width: auto;
    align-self: center;
    border-radius: 22px;
    overflow: hidden;
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.28);
    margin-bottom: 4px;
  }

  .lyric-scroll {
    // 高度刚好容纳 2 行歌词，当前行居中、另一行完整显示，避免半行被裁切
    flex: 0 0 71px;
    height: 71px;
    margin-top: 4px;
    // 歌词用 transform 翻页：禁用原生滚动
    overflow: hidden;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }

    .lyric-container {
      // 最后几行滚到顶部时底下留出一行的呼吸空间
      padding-bottom: 36px;
      // 柔和翻页：Material standard 缓动
      transition: transform 450ms cubic-bezier(0.4, 0, 0.2, 1);

      .lyric-line {
        padding: 5px 0;
        font-size: 18px;
        line-height: 1.6;
        text-align: left;
        color: var(--theme-text, #fff);
        opacity: 0.5;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition:
          color 0.2s,
          opacity 0.2s;

        &.active {
          font-size: 22px;
          color: var(--theme-text, #fff);
          opacity: 1;
          font-weight: 500;
        }
      }
    }
  }

  .song-title {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 8px;
    min-width: 0;
    margin-top: 16px;
    flex-shrink: 0;

    h3 {
      min-width: 0;
      margin: 0;
      font-size: 25px;
      font-weight: 600;
      line-height: 1.3;
      color: var(--theme-text, #fff);
      white-space: nowrap;
      overflow: hidden;
    }

    .tag {
      flex-shrink: 0;
      padding: 2px 7px;
      border-radius: 6px;
      font-size: 11px;
      line-height: 1.5;
      white-space: nowrap;
    }

    .tag-outline {
      color: var(--theme-text, #fff);
      opacity: 0.9;
      border: 1px solid rgba(128, 128, 128, 0.45);
    }

    .tag-solid {
      color: var(--theme-text, #fff);
      opacity: 0.9;
      background: rgba(128, 128, 128, 0.28);
    }

    .song-tags {
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
      gap: 6px;
      padding: 0;
      border: 0;
      background: transparent;
      cursor: pointer;
    }

    .tag-empty {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      opacity: 0.75;
    }
  }

  .artist-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    overflow: hidden;
    margin-top: 10px;
    flex-shrink: 0;

    .artist {
      min-width: 0;
      font-size: 14px;
      color: var(--theme-text, #fff);
      opacity: 0.65;
      white-space: nowrap;
      overflow: hidden;
    }
  }

  .action-row {
    display: flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 26px;
    min-width: 0;
    overflow: hidden;
    margin-top: 18px;
    flex-shrink: 0;

    .action-item {
      display: flex;
      flex-shrink: 0;
      flex-direction: column;
      align-items: center;
      gap: 1px;

      .action-icon {
        cursor: pointer;
      }

      .action-count {
        font-size: 11px;
        color: var(--theme-text, #fff);
        opacity: 0.7;
      }
    }

    .action-right {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-left: auto;

      .more-icon {
        display: block;
        cursor: pointer;
      }
    }
  }

  .music-progress {
    position: relative;
    margin-top: 18px;
    flex-shrink: 0;
    height: 2px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.2);

    // 已缓冲部分（位于滑块轨道下方）
    .buffer-bar {
      position: absolute;
      top: 0;
      left: 0;
      height: 2px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.42);
      transition: width 0.2s linear;
      pointer-events: none;
    }

    :deep(.van-slider) {
      position: relative;
      z-index: 1;
      background: transparent;
      // 手势完全交给滑块，不与纵向轮播抢
      touch-action: none;

      // 用伪元素扩大触摸热区（不改滑块本体布局）
      &::before {
        content: '';
        position: absolute;
        inset: -14px 0;
      }
    }

    :deep(.van-slider__button) {
      background: #fff;
      border: none;
      box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.22);
    }
  }
}
</style>
