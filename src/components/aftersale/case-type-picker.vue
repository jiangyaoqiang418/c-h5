<script setup lang="ts">
import { enums } from '@shared';

interface Props {
  modelValue?: Api.Order.AftersaleCaseType;
}
defineProps<Props>();
defineEmits<{ (e: 'update:modelValue', v: Api.Order.AftersaleCaseType): void }>();

const TYPES: { type: Api.Order.AftersaleCaseType; emoji: string; hint: string }[] = [
  { type: 'REFUND', emoji: '↩️', hint: '退还商品并退还货款' },
  { type: 'REPLACE', emoji: '🔄', hint: '更换相同或同等价值商品' },
  { type: 'REPAIR', emoji: '🔧', hint: '维修商品保留所有权' },
  { type: 'PARTIAL_REFUND', emoji: '💰', hint: '保留商品退还部分货款' },
  { type: 'REFUND_ONLY', emoji: '📥', hint: '仅退款（适用未发货）' }
];
</script>

<template>
  <view class="type-picker">
    <view
      v-for="t in TYPES"
      :key="t.type"
      class="card"
      :class="{ active: modelValue === t.type }"
      @click="$emit('update:modelValue', t.type)"
    >
      <text class="emoji">{{ t.emoji }}</text>
      <view class="info">
        <text class="label">{{ enums.AFTERSALE_CASE_TYPE_META[t.type].label }}</text>
        <text class="hint">{{ t.hint }}</text>
      </view>
      <text v-if="modelValue === t.type" class="check">✓</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.type-picker {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.card {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 24rpx;
  background: #fff;
  border: 2rpx solid #f2f3f5;
  border-radius: 12rpx;
}
.card.active {
  border-color: #4d80f0;
  background: #f3f7ff;
}
.emoji {
  font-size: 40rpx;
  flex-shrink: 0;
}
.info {
  flex: 1;
}
.label {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #1d2129;
}
.hint {
  display: block;
  font-size: 22rpx;
  color: #86909c;
  margin-top: 4rpx;
}
.check {
  color: #4d80f0;
  font-size: 36rpx;
  font-weight: 700;
}
</style>
