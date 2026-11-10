/**
 * 播放源设置 —— 设置弹层与音源选择器
 */
import type { PlaybackSource } from '@/constants/player-ui'
import { PLAYBACK_SOURCES } from '@/constants/player-ui'
import { computed, ref } from 'vue'

export function usePlaybackSource() {
  const settingsVisible = ref(false)
  const source = ref<PlaybackSource>('netease')
  const pickerVisible = ref(false)

  const sourceOptions = computed(() => PLAYBACK_SOURCES)
  const currentSourceLabel = computed(
    () => PLAYBACK_SOURCES.find(item => item.value === source.value)?.label ?? source.value,
  )
  const pickerColumns = computed(() => [PLAYBACK_SOURCES.map(item => item.label)])

  function openSettings() {
    settingsVisible.value = true
  }

  function closeSettings() {
    settingsVisible.value = false
  }

  function openSourcePicker() {
    pickerVisible.value = true
  }

  function closeSourcePicker() {
    pickerVisible.value = false
  }

  /** 音源选择器确认（Vant picker 回调） */
  function confirmSource(selectedValues: string[]) {
    const matched = PLAYBACK_SOURCES.find(item => item.label === selectedValues[0])
    if (matched) source.value = matched.value
    pickerVisible.value = false
  }

  return {
    settingsVisible,
    source,
    pickerVisible,
    sourceOptions,
    currentSourceLabel,
    pickerColumns,
    openSettings,
    closeSettings,
    openSourcePicker,
    closeSourcePicker,
    confirmSource,
  }
}
