/**
 * 听歌模式 —— 模式/场景选择与侧栏折叠
 */
import { LISTENING_MODES, LISTENING_SCENES } from '@/constants/player-ui'
import { computed, ref } from 'vue'

export const DEFAULT_MODE_NAME = '模式选择'

export function useListeningMode() {
  const isCollapsed = ref(true)
  const currentMode = ref('default')
  const modeList = computed(() => LISTENING_MODES)
  const sceneList = computed(() => LISTENING_SCENES)

  const currentModeName = computed(() => {
    if (!currentMode.value || currentMode.value === 'default')
      return DEFAULT_MODE_NAME
    return LISTENING_MODES.find(mode => mode.value === currentMode.value)?.label
      || LISTENING_SCENES.find(scene => scene.value === currentMode.value)?.label
      || ''
  })

  function toggleSidebar() {
    isCollapsed.value = !isCollapsed.value
  }

  return { isCollapsed, currentMode, modeList, sceneList, currentModeName, toggleSidebar }
}
