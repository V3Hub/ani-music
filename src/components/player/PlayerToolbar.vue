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
  gap: 10px;
  width: 100%;
  padding: 0 20px;
  box-sizing: border-box;
  position: relative;
  z-index: 200;

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    overflow: hidden;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--theme-text, #fff);
  }

  .toolbar-icon {
    flex-shrink: 0;
    color: var(--theme-text, #fff);
  }

  .mode-name {
    font-size: 18px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
  }

  .toolbar-search {
    cursor: pointer;
  }
}
</style>
