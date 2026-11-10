<template>
  <div class="player-stage">
    <Swiper
      v-model:slide-index="swiperIndex"
      :modules="[Virtual]"
      direction="vertical"
      :loop="true"
      :virtual="true"
      :slides-per-view="1"
      :space-between="0"
      :allow-touch-move="true"
      style="width: 100%; height: 100%"
      @swiper="onSwiperReady"
      @slide-change-transition-end="onSlideChange"
    >
      <SwiperSlide v-for="song in player.playList" :key="song.id" :virtual-index="song.id">
        <div class="slide-content">
          <div class="cover-box">
            <van-image width="100%" height="100%" :src="song.pic ?? ''" fit="cover" />
          </div>

          <div
            :ref="(el: any) => registerLyricContainer(song.id, el as HTMLElement | null)"
            class="lyric-scroll"
          >
            <div class="lyric-container">
              <div
                v-for="(line, index) in resolveLyricLines(song)"
                :key="index"
                class="lyric-line"
                :class="{ active: isCurrent(song) && currentLine === index }"
              >
                {{ line }}
              </div>
              <van-empty
                v-if="!resolveLyricLines(song).length"
                image="musical-note"
                description="暂时没找到歌词"
              />
            </div>
          </div>

          <div class="song-title">
            <h3>{{ song.title }}</h3>
          </div>

          <div class="artist-row">
            <span class="artist">{{ song.singer }}</span>
            <button type="button" class="follow-btn">关注</button>
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
            <div class="action-item">
              <van-icon name="chat-o" size="27" color="#FFFFFF" />
              <span class="action-count">4</span>
            </div>
            <div class="action-item">
              <van-icon name="share-o" size="27" color="#FFFFFF" />
              <span class="action-count">28</span>
            </div>
            <div class="action-right">
              <button type="button" class="listen-btn">免费听</button>
              <van-icon name="ellipsis" size="22" color="#FFFFFF" class="more-icon" @click="emit('openQueue')" />
            </div>
          </div>
          <div class="music-progress">
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
              :readonly="!isCurrent(song) || !player.canplay"
              bar-height="3"
              button-size="12"
              active-color="#fff"
              inactive-color="transparent"
              @update:model-value="onSliderUpdate"
              @drag-end="onSliderDragEnd"
            />
          </div>
        </div>
      </SwiperSlide>
    </Swiper>
  </div>
</template>

<script setup lang="ts">
import type { Song } from '@/types/music'
import { usePlaybackControl } from '@/composables/player/usePlaybackControl'
import { useLyricSync, resolveLyricLines } from '@/composables/player/useLyricSync'
import { useSongCarousel } from '@/composables/player/useSongCarousel'
import { usePlayerStore } from '@/stores/player'
import { Swiper, SwiperSlide } from 'swiper/vue'
import { Virtual } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/virtual'
import { ref, watch } from 'vue'

const props = defineProps<{ favoriteSongs: Song[] }>()

const emit = defineEmits<{
  (e: 'favorite', id?: string | number): void
  (e: 'openQueue'): void
}>()

const player = usePlayerStore()
const { swiperIndex, onSwiperReady, onSlideChange } = useSongCarousel()
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

  .slide-content {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 35px 20px 60px;
    box-sizing: border-box;
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
    flex: 0 0 84px;
    height: 84px;
    margin-top: 4px;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
    // 选中行固定在顶部，只对底部做渐隐
    mask-image: linear-gradient(to bottom, #000 0%, #000 76%, transparent 100%);

    &::-webkit-scrollbar {
      display: none;
    }

    .lyric-container {
      // 留出容器高度减去一行的高度，保证最后几行也能滚到顶部
      padding-bottom: 54px;

      .lyric-line {
        padding: 5px 0;
        font-size: 16px;
        line-height: 1.6;
        text-align: left;
        color: rgba(255, 255, 255, 0.5);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition:
          color 0.2s,
          font-size 0.2s;

        &.active {
          color: #fff;
          font-size: 17px;
          font-weight: 500;
        }
      }
    }
  }

  .song-title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
    flex-shrink: 0;

    h3 {
      margin: 0;
      font-size: 25px;
      font-weight: 600;
      line-height: 1.3;
      color: #fff;
    }

    .tag {
      padding: 2px 7px;
      border-radius: 6px;
      font-size: 11px;
      line-height: 1.5;
      white-space: nowrap;
    }

    .tag-outline {
      color: rgba(255, 255, 255, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.45);
    }

    .tag-solid {
      color: rgba(255, 255, 255, 0.9);
      background: rgba(255, 255, 255, 0.18);
    }
  }

  .artist-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
    flex-shrink: 0;

    .artist {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.65);
    }

    .follow-btn {
      padding: 3px 11px;
      border: none;
      border-radius: 999px;
      font-size: 11px;
      color: #fff;
      background: rgba(255, 255, 255, 0.18);
    }
  }

  .action-row {
    display: flex;
    align-items: center;
    gap: 26px;
    margin-top: 18px;
    flex-shrink: 0;

    .action-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1px;

      .action-icon {
        cursor: pointer;
      }

      .action-count {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.7);
      }
    }

    .action-right {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-left: auto;

      .listen-btn {
        padding: 7px 14px;
        border: 1px solid rgba(255, 255, 255, 0.35);
        border-radius: 999px;
        font-size: 13px;
        color: #fff;
        background: transparent;
      }

      .more-icon {
        cursor: pointer;
      }
    }
  }

  .music-progress {
    position: relative;
    margin-top: 18px;
    flex-shrink: 0;
    height: 3px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.2);

    // 已缓冲部分（位于滑块轨道下方）
    .buffer-bar {
      position: absolute;
      top: 0;
      left: 0;
      height: 3px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.42);
      transition: width 0.2s linear;
      pointer-events: none;
    }

    :deep(.van-slider) {
      position: relative;
      z-index: 1;
      background: transparent;

      &::before {
        content: '';
        position: absolute;
        inset: -10px 0; // 扩大触摸热区，细进度条也好拖
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
