<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

const emit = defineEmits<{ select: [emoji: string] }>()

const EMOJIS = [
  '😀',
  '😄',
  '😁',
  '😆',
  '😊',
  '🥰',
  '😍',
  '😘',
  '😜',
  '🤩',
  '🥳',
  '🤗',
  '🙃',
  '😴',
  '😢',
  '😭',
  '😡',
  '🤔',
  '🙏',
  '👍',
  '👏',
  '💪',
  '❤️',
  '💖',
  '💔',
  '🔥',
  '✨',
  '🌟',
  '🎵',
  '🎧',
  '🌈',
  '☀️',
  '🌙',
  '🍀',
  '🎉',
  '🎁',
  '☕',
  '🍰',
  '🐱',
  '🐶',
]

const open = ref(false)
const root = ref<HTMLElement>()

function offDoc() {
  document.removeEventListener('click', onDocClick)
}

function onDocClick(event: MouseEvent) {
  if (!root.value?.contains(event.target as Node))
    close()
}

function toggle() {
  open.value = !open.value
  if (open.value)
    document.addEventListener('click', onDocClick)
  else
    offDoc()
}

function close() {
  open.value = false
  offDoc()
}

function pick(emoji: string) {
  emit('select', emoji)
  close()
}

onBeforeUnmount(offDoc)
</script>

<template>
  <div ref="root" class="emoji-wrap">
    <button
      type="button"
      class="emoji-trigger"
      :class="{ active: open }"
      @click.stop="toggle"
    >
      <van-icon name="smile-o" />
    </button>
    <transition name="emoji-pop">
      <div v-if="open" class="emoji-panel" @click.stop>
        <button
          v-for="emoji in EMOJIS"
          :key="emoji"
          type="button"
          class="emoji-item"
          @click="pick(emoji)"
        >
          {{ emoji }}
        </button>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.emoji-wrap {
  position: relative;
  display: inline-flex;
}

.emoji-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.6);
  font-size: 18px;
  background: transparent;
  cursor: pointer;
  transition:
    color 0.2s ease,
    background 0.2s ease;
}

.emoji-trigger.active,
.emoji-trigger:active {
  color: #f0abfc;
  background: rgba(255, 255, 255, 0.1);
}

.emoji-panel {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 12;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  width: 256px;
  padding: 8px;
  border-radius: 14px;
  background: rgba(38, 25, 68, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.14);
  box-shadow: 0 16px 38px rgba(9, 6, 26, 0.5);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.emoji-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  font-size: 19px;
  line-height: 1;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s ease;
}

.emoji-item:active {
  background: rgba(255, 255, 255, 0.14);
}

.emoji-pop-enter-active,
.emoji-pop-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.emoji-pop-enter-from,
.emoji-pop-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.96);
}
</style>
