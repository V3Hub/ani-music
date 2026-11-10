<template>
  <van-popup
    v-model:show="visible"
    position="right"
    round
    :style="{ width: '100%' }"
  >
    <van-nav-bar
      title="设置"
      left-text="关闭"
      left-arrow
      @click-left="visible = false"
    />
    <van-cell-group inset>
      <van-cell title="播放源">
        <template #value>
          <van-button plain size="mini" @click="pickerVisible = true">
            {{ sourceLabel }}
          </van-button>
        </template>
      </van-cell>
    </van-cell-group>
    <van-popup v-model:show="pickerVisible" position="bottom" round>
      <van-picker
        :columns="pickerColumns"
        @confirm="onConfirmSource"
        @cancel="pickerVisible = false"
      />
    </van-popup>
  </van-popup>
</template>

<script setup lang="ts">
defineProps<{
  sourceLabel: string
  pickerColumns: string[][]
}>()

const emit = defineEmits<{
  (e: 'confirmSource', selectedValues: string[]): void
}>()

const visible = defineModel<boolean>('visible', { required: true })
const pickerVisible = defineModel<boolean>('pickerVisible', { required: true })

function onConfirmSource({ selectedValues }: { selectedValues: string[] }) {
  emit('confirmSource', selectedValues)
}
</script>
