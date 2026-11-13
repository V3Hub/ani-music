<template>
  <aside
    class="listening-sidebar"
    :class="{ 'is-dragging': dragging, 'is-open': width > 0 }"
    :style="{ width: `${width}px` }"
  >
    <div class="sidebar-inner">
      <div class="sidebar-header">
        <div class="brand-group">
          <span class="sidebar-brand">Ani 音乐</span>
          <span class="sidebar-slogan">Music · Always With You</span>
        </div>
        <button type="button" class="sidebar-close" @click="emit('close')">
          <van-icon name="cross" />
        </button>
      </div>
      <div class="sidebar-title">听歌模式</div>

      <div class="mode-list">
        <button
          v-for="mode in modeList"
          :key="mode.value"
          type="button"
          class="mode-item"
          :class="{ 'is-active': currentMode === mode.value }"
          @click="currentMode = mode.value"
        >
          <!-- 当前选中的模式：播放波纹动画；未选中只显示文字 -->
          <WaveBox
            v-if="currentMode === mode.value"
            class="mode-wave"
            :playing="playing"
            variant="overlay"
            color="#16171d"
          />
          <span class="mode-label">{{ mode.label }}</span>
        </button>
      </div>

      <div class="scene-grid">
        <button
          v-for="scene in sceneList"
          :key="scene.value"
          type="button"
          class="scene-item"
          :class="{ 'is-active': currentMode === scene.value }"
          @click="currentMode = scene.value"
        >
          <van-icon :name="scene.icon" class="scene-icon" />
          <span class="scene-label">{{ scene.label }}</span>
        </button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { ListeningModeOption, ListeningSceneOption } from '@/constants/player-ui'
import WaveBox from '@/components/waveBox/WaveBox.vue'

defineProps<{
  /** 当前宽度（px），由手势拖动驱动 */
  width: number
  /** 拖动中：关闭过渡，保证跟手 */
  dragging: boolean
  /** 播放中：默认模式前的波纹才跳动 */
  playing: boolean
  modeList: ListeningModeOption[]
  sceneList: ListeningSceneOption[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const currentMode = defineModel<string>('currentMode', { required: true })
</script>

<style lang="scss" scoped>
.listening-sidebar {
  // 覆盖在播放页之上：展开时不再挤压右侧内容
  position: absolute;
  top: 0;
  left: 0;
  z-index: 300;
  width: 0;
  height: 100%;
  overflow: hidden;
  text-align: left;
  white-space: nowrap;
  // 背景跟随封面主题色
  background-color: var(--theme-background, #0a0b16);
  transition:
    width 0.28s cubic-bezier(0.22, 0.61, 0.36, 1),
    background-color 0.65s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);

  &.is-open {
    box-shadow: 8px 0 24px rgba(0, 0, 0, 0.3);
  }

  &.is-dragging {
    transition: background-color 0.65s cubic-bezier(0.4, 0, 0.2, 1);
  }

  // 内容保持最小宽度：侧栏收窄时裁切而不是换行重排
  .sidebar-inner {
    display: flex;
    flex-direction: column;
    width: 100%;
    min-width: 250px;
    height: 100%;
    padding: calc(12px + env(safe-area-inset-top)) 14px calc(18px + env(safe-area-inset-bottom));
    box-sizing: border-box;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 4px 16px;
  }

  .brand-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .sidebar-brand {
    font-size: 21px;
    font-weight: 800;
    line-height: 1.15;
    letter-spacing: 1.2px;
    color: var(--theme-text, #fff);
  }

  .sidebar-slogan {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 1.6px;
    text-transform: uppercase;
    color: var(--theme-text, #fff);
    opacity: 0.45;
    white-space: nowrap;
    overflow: hidden;
  }

  // 分组小标题：左侧竖条 + 细分割线，层级更清晰
  .sidebar-title {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 2px 4px 14px;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 1px;
    color: var(--theme-text, #fff);
    opacity: 0.55;

    &::before {
      content: '';
      flex-shrink: 0;
      width: 3px;
      height: 12px;
      border-radius: 2px;
      background: currentColor;
    }
  }

  .sidebar-close {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 50%;
    background: rgba(128, 128, 128, 0.16);
    color: var(--theme-text, #fff);
    font-size: 15px;
    line-height: 1;
    opacity: 0.85;
    cursor: pointer;
    transition:
      transform 0.15s ease,
      background-color 0.2s ease;

    &:active {
      transform: scale(0.9);
    }
  }

  // ===== 模式：整行胶囊，选中为白底深色字 =====
  .mode-list {
    display: flex;
    flex-direction: column;
    gap: 10px;

    .mode-item {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      height: 48px;
      padding: 0 16px;
      border: none;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--theme-text, #fff);
      font-size: 15px;
      font-weight: 500;
      text-align: left;
      cursor: pointer;
      transition:
        background-color 0.2s,
        color 0.2s,
        transform 0.15s;

      &:active {
        transform: scale(0.985);
      }

      // 选中模式前的播放波纹
      .mode-wave {
        flex-shrink: 0;
        width: 16px;
      }

      .mode-label {
        overflow: hidden;
      }

      &.is-active {
        background: #fff;
        color: #16171d;
        font-weight: 600;

        .mode-icon {
          opacity: 1;
        }
      }
    }
  }

  // ===== 场景：三列图标宫格 =====
  .scene-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 22px 6px;
    margin-top: 26px;
    padding-bottom: 8px;
  }

  .scene-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--theme-text, #fff);
    font-size: 12px;
    cursor: pointer;
    transition:
      opacity 0.2s,
      transform 0.15s;

    &:active {
      transform: scale(0.94);
    }

    .scene-icon {
      font-size: 22px;
      opacity: 0.7;
      transition: opacity 0.2s;
    }

    .scene-label {
      opacity: 0.7;
      transition:
        opacity 0.2s,
        font-weight 0.2s;
    }

    &.is-active {
      .scene-icon {
        opacity: 1;
      }

      .scene-label {
        opacity: 1;
        font-weight: 600;
      }
    }
  }
}
</style>
