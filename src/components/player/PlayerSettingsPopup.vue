<template>
  <van-popup
    v-model:show="visible"
    position="right"
    :style="{ width: '100%', height: '100%' }"
    class="settings-popup"
  >
    <div class="settings-wrap" :style="swipeStyle" v-on="handlers">
      <div class="settings-header">
        <van-icon name="arrow-left" size="20" class="close-icon" @click="visible = false" />
        <div class="header-title">设置</div>
      </div>

      <div class="settings-body">
        <!-- 播放设置 -->
        <section class="settings-section">
          <div class="section-title">播放设置</div>
          <ul class="section-list">
            <li class="section-item" @click="openSourcePicker">
              <span class="item-label">播放源</span>
              <span class="item-value">
                {{ sourceLabel }}
                <van-icon name="arrow" size="14" class="item-arrow" />
              </span>
            </li>
            <li class="section-item" @click="sleepVisible = true">
              <span class="item-label">定时关闭</span>
              <span class="item-value">
                <span class="item-status">{{ sleepLabel }}</span>
                <van-icon name="arrow" size="14" class="item-arrow" />
              </span>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <!-- 播放源选择器（bottom sheet，和定时关闭同风格） -->
    <van-popup v-model:show="pickerVisible" position="bottom" round>
      <div class="source-sheet">
        <div class="sheet-title">选择播放源</div>
        <div class="source-options">
          <button
            v-for="opt in sourceOptions"
            :key="opt.value"
            type="button"
            class="source-btn"
            :class="{ 'is-active': opt.value === currentSource }"
            @click="onPickSource(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
        <div class="source-sheet-hint">切换播放源后，搜索将使用该音源</div>
      </div>
    </van-popup>

    <!-- 定时关闭选择器 -->
    <van-popup v-model:show="sleepVisible" position="bottom" round>
      <div class="sleep-sheet">
        <div class="sheet-title">定时关闭</div>
        <div class="sleep-options">
          <button
            v-for="opt in SLEEP_OPTIONS"
            :key="opt"
            type="button"
            class="sleep-btn"
            :class="{ 'is-active': opt === sleepMinutes }"
            @click="onPickSleep(opt)"
          >
            {{ opt === 0 ? '关闭' : `${opt} 分钟后停止` }}
          </button>
        </div>
      </div>
    </van-popup>
  </van-popup>
</template>

<script setup lang="ts">
import type { PlaybackSourceOption } from '@/constants/player-ui'
import { SLEEP_OPTIONS } from '@/composables/player/usePlaybackSource'
import { useSwipeClose } from '@/composables/useSwipeClose'

defineProps<{
  sourceLabel: string
  sourceOptions: PlaybackSourceOption[]
  currentSource: string
  sleepLabel: string
  sleepMinutes: number
}>()

const emit = defineEmits<{
  (e: 'confirmSource', sourceValue: string): void
  (e: 'setSleepTimer', minutes: number): void
}>()

const visible = defineModel<boolean>('visible', { required: true })
const pickerVisible = defineModel<boolean>('pickerVisible', { required: true })
const sleepVisible = defineModel<boolean>('sleepVisible', { required: true, default: () => false })

const { swipeStyle, handlers } = useSwipeClose(() => {
  // 子弹层打开时不响应右滑关闭
  if (pickerVisible.value || sleepVisible.value)
    return
  visible.value = false
})

function openSourcePicker() {
  pickerVisible.value = true
}

function onPickSource(value: string) {
  emit('confirmSource', value)
}

function onPickSleep(minutes: number) {
  emit('setSleepTimer', minutes)
  sleepVisible.value = false
}
</script>

<style lang="scss" scoped>
.settings-popup {
  background: transparent !important;
}

.settings-wrap {
  height: 100%;
  color: var(--theme-text, #fff);
  background: var(--theme-background, #1a1a1a);
  display: flex;
  flex-direction: column;
  touch-action: pan-y;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(14px + env(safe-area-inset-top)) 20px 14px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.18);

  .header-title {
    flex: 1;
    text-align: center;
    font-size: 16px;
    font-weight: 600;
  }

  .close-icon {
    color: var(--theme-text, #fff);
    cursor: pointer;
  }
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 20px 24px;
}

.settings-section + .settings-section {
  margin-top: 28px;
}

.section-title {
  font-size: 12px;
  opacity: 0.45;
  margin-bottom: 12px;
  padding-left: 4px;
}

.section-list {
  list-style: none;
  margin: 0;
  padding: 0;
  background: rgba(128, 128, 128, 0.08);
  border-radius: 14px;
  overflow: hidden;
}

.section-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px;
  cursor: pointer;
  transition: background 0.12s;

  &:active {
    background: rgba(128, 128, 128, 0.16);
  }

  & + & {
    border-top: 1px solid rgba(128, 128, 128, 0.12);
  }

  .item-label {
    font-size: 15px;
  }

  .item-value {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    opacity: 0.65;
  }

  .item-status {
    opacity: 0.85;
  }

  .item-arrow {
    opacity: 0.5;
  }
}

/** 播放源选择 bottom sheet */
.source-sheet {
  padding: 4px 20px calc(20px + env(safe-area-inset-bottom));
  color: var(--theme-text, #fff);
  background: var(--theme-background, #1a1a1a);

  .sheet-title {
    padding: 16px 0;
    text-align: center;
    font-size: 16px;
    font-weight: 600;
  }
}

.source-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.source-btn {
  padding: 14px 0;
  border: none;
  border-radius: 12px;
  background: rgba(128, 128, 128, 0.12);
  color: var(--theme-text, #fff);
  font-size: 15px;
  cursor: pointer;

  &.is-active {
    background: var(--theme-text, #fff);
    color: var(--theme-background, #1a1a1a);
    font-weight: 600;
  }
}

.source-sheet-hint {
  margin-top: 14px;
  text-align: center;
  font-size: 12px;
  opacity: 0.4;
}

/** 定时关闭 bottom sheet */
.sleep-sheet {
  padding: 4px 20px calc(20px + env(safe-area-inset-bottom));
  color: var(--theme-text, #fff);
  background: var(--theme-background, #1a1a1a);

  .sheet-title {
    padding: 16px 0;
    text-align: center;
    font-size: 16px;
    font-weight: 600;
  }
}

.sleep-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sleep-btn {
  padding: 14px 0;
  border: none;
  border-radius: 12px;
  background: rgba(128, 128, 128, 0.12);
  color: var(--theme-text, #fff);
  font-size: 15px;
  cursor: pointer;

  &.is-active {
    background: var(--theme-text, #fff);
    color: var(--theme-background, #1a1a1a);
    font-weight: 600;
  }
}
</style>
