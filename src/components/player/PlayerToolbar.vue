<template>
  <header class="player-toolbar">
    <button type="button" class="toolbar-left" @click="emit('toggleSidebar')">
      <van-icon name="bars" size="22" class="toolbar-icon" />
      <span class="mode-name">{{ modeName }}</span>
    </button>
    <van-icon name="search" size="21" class="toolbar-icon toolbar-search" @click="emit('openSearch')" />
  </header>
</template>

<script setup lang="ts">
defineProps<{ modeName: string }>()

const emit = defineEmits<{
  (e: 'toggleSidebar'): void
  (e: 'openSearch'): void
}>()
</script>

<style lang="scss" scoped>
.player-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0 20px;
  box-sizing: border-box;
  position: relative;
  z-index: 200;

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--theme-text, #fff);
  }

  .toolbar-icon {
    color: var(--theme-text, #fff);
  }

  .mode-name {
    font-size: 18px;
    font-weight: 600;
    line-height: 1;
  }

  .toolbar-search {
    cursor: pointer;
  }
}
</style>
