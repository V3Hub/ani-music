/**
 * 玩家页导航 —— 底部 Tab 切换
 */
import { PLAYER_NAV_ITEMS } from '@/constants/player-ui'
import { computed, ref } from 'vue'

export const PLAYER_TABS = {
  discover: 'discover',
  rank: 'rank',
  music: 'music',
  benefit: 'benefit',
  owner: 'owner',
} as const

export function usePlayerNavigation() {
  const currentTab = ref<string>(PLAYER_TABS.music)
  const navList = computed(() => PLAYER_NAV_ITEMS)

  function navigate(tab: string) {
    currentTab.value = tab
  }

  return { currentTab, navList, navigate }
}
