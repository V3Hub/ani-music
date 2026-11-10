<template>
  <aside class="listening-sidebar" :class="{ 'is-collapsed': collapsed }">
    <div class="sidebar-title">听歌模式</div>
    <van-radio-group v-model="currentMode" direction="vertical">
      <div class="mode-list">
        <van-radio
          v-for="mode in modeList"
          :key="mode.value"
          :name="mode.value"
        >
          {{ mode.label }}
        </van-radio>
      </div>
    </van-radio-group>
    <van-cell-group inset class="scene-group">
      <van-radio-group v-model="currentMode">
        <van-grid :column-num="3" :gutter="8">
          <van-grid-item v-for="scene in sceneList" :key="scene.value">
            <van-radio :name="scene.value" class="scene-radio">
              <van-icon :name="scene.icon" />
              <div>{{ scene.label }}</div>
            </van-radio>
          </van-grid-item>
        </van-grid>
      </van-radio-group>
    </van-cell-group>
  </aside>
</template>

<script setup lang="ts">
import type { ListeningModeOption, ListeningSceneOption } from '@/constants/player-ui'

defineProps<{
  collapsed: boolean
  modeList: ListeningModeOption[]
  sceneList: ListeningSceneOption[]
}>()

const currentMode = defineModel<string>('currentMode', { required: true })
</script>

<style lang="scss" scoped>
.listening-sidebar {
  flex-shrink: 0;
  width: 300px;
  height: 100%;
  padding: 15px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  overflow: hidden;
  text-align: left;
  background-color: #f7f8fa;
  transition:
    width 0.3s ease,
    padding 0.3s ease;

  .sidebar-title {
    padding: 15px 0;
    font-size: 20px;
    font-weight: bold;
  }

  .scene-group {
    flex: 1;
  }

  &.is-collapsed {
    width: 0;
    padding: 0;
  }
}
</style>
