<template>
  <van-popup
    :show="visible"
    position="bottom"
    round
    teleport="body"
    class="create-playlist-popup"
    @update:show="emit('update:visible', $event)"
  >
    <div class="create-playlist">
      <div class="sheet-header">
        <button type="button" class="header-btn" @click="close">
          取消
        </button>
        <span class="sheet-title">创建歌单</span>
        <button type="button" class="header-btn confirm" :disabled="!canSubmit || submitting" @click="onSubmit">
          确认
        </button>
      </div>

      <div class="field">
        <input
          v-model="name"
          class="field-input"
          type="text"
          maxlength="30"
          placeholder="输入新建歌单标题"
        >
        <span class="counter">{{ name.length }}/30</span>
      </div>

      <div class="field field-area">
        <textarea
          v-model="desc"
          class="field-textarea"
          maxlength="100"
          rows="3"
          placeholder="添加歌单描述（选填）"
        />
        <span class="counter">{{ desc.length }}/100</span>
      </div>
    </div>
  </van-popup>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  submitting?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'submit', payload: { name: string, desc: string }): void
}>()

const name = ref('')
const desc = ref('')

const canSubmit = computed(() => name.value.trim().length > 0)

// 关闭弹窗后清空输入，下次打开是干净状态
watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      name.value = ''
      desc.value = ''
    }
  },
)

function close() {
  emit('update:visible', false)
}

function onSubmit() {
  if (!canSubmit.value || props.submitting)
    return
  emit('submit', { name: name.value.trim(), desc: desc.value.trim() })
}
</script>

<style lang="scss" scoped>
.create-playlist-popup {
  // 深色半透明浮层，和页面主题背景区分开
  background: var(--theme-background, #1a1a1a) !important;
  border-top: 1px solid rgba(128, 128, 128, 0.2);
}

.create-playlist {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 16px calc(20px + env(safe-area-inset-bottom));
  color: var(--theme-text, #fff);
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;

  .sheet-title {
    font-size: 16px;
    font-weight: 600;
  }

  .header-btn {
    padding: 4px 2px;
    border: none;
    font-size: 15px;
    color: inherit;
    opacity: 0.85;
    background: transparent;
    cursor: pointer;

    &:disabled {
      opacity: 0.35;
      cursor: default;
    }

    &.confirm:not(:disabled) {
      opacity: 1;
      font-weight: 500;
    }
  }
}

.field {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(128, 128, 128, 0.16);
}

.field-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  font-size: 15px;
  line-height: 1.4;
  color: inherit;
  background: transparent;

  &::placeholder {
    color: inherit;
    opacity: 0.4;
  }
}

.field-area {
  align-items: flex-start;

  .field-textarea {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    resize: none;
    font-family: inherit;
    font-size: 14px;
    line-height: 1.5;
    color: inherit;
    background: transparent;

    &::placeholder {
      color: inherit;
      opacity: 0.4;
    }
  }

  .counter {
    align-self: flex-end;
  }
}

.counter {
  flex-shrink: 0;
  font-size: 12px;
  opacity: 0.45;
}
</style>
