<template>
  <span v-if="level > 0" class="vip-badge" :class="[`lv${Math.min(level, 9)}`, { small }]">
    <van-icon name="gem-o" class="vip-icon" />
    <span>VIP{{ level }}</span>
    <span v-if="!small" class="vip-forever">永久</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  /** VIP 等级：0 不显示，1-9 显示对应等级徽章 */
  level?: number
  /** 小号徽章（用于评论、心愿等列表昵称旁） */
  small?: boolean
}>(), {
  level: 0,
  small: false,
})

const level = computed(() => props.level || 0)
const small = computed(() => props.small)
</script>

<style scoped>
.vip-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 9px;
  border: 1px solid rgba(242, 201, 125, 0.4);
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(242, 201, 125, 0.2), rgba(242, 201, 125, 0.08));
  color: #f2c97d;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  vertical-align: middle;

  .vip-icon {
    font-size: 12px;
  }

  .vip-forever {
    padding-left: 4px;
    border-left: 1px solid rgba(242, 201, 125, 0.3);
    font-size: 10px;
    font-weight: 400;
    opacity: 0.85;
  }

  /* 高等级徽章色调略作区分 */
  &.lv4,
  &.lv5,
  &.lv6 {
    border-color: rgba(167, 139, 250, 0.45);
    background: linear-gradient(135deg, rgba(167, 139, 250, 0.22), rgba(167, 139, 250, 0.08));
    color: #c4b5fd;
  }

  &.lv7,
  &.lv8,
  &.lv9 {
    border-color: rgba(255, 145, 172, 0.45);
    background: linear-gradient(135deg, rgba(255, 145, 172, 0.22), rgba(255, 145, 172, 0.08));
    color: #ff91ac;
  }

  &.small {
    gap: 2px;
    padding: 1px 5px;
    font-size: 9px;

    .vip-icon {
      font-size: 9px;
    }
  }
}
</style>
