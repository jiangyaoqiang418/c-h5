<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';
import { formatAmount } from '@/utils/format-bridge';
import type { BucketKey } from '@shared/enums/wallet';

interface Props {
  bucketKey: BucketKey;
  amount: string;
}
const props = defineProps<Props>();
const meta = computed(() => enums.BUCKET_META[props.bucketKey]);

const colorHex = computed(() => {
  const m: Record<string, string> = {
    green: '#00b42a', blue: '#4d80f0', purple: '#722ed1', orange: '#ff7d00',
    red: '#f53f3f', cyan: '#0fc6c2', gray: '#86909c'
  };
  return m[meta.value.color] || '#86909c';
});
</script>

<template>
  <view class="bucket-card" :style="{ '--bg': colorHex + '20', '--c': colorHex }">
    <text class="name">{{ meta.label }}</text>
    <view class="amount-row">
      <text class="unit">U</text>
      <text class="amount">{{ formatAmount(amount) }}</text>
    </view>
    <text class="hint">{{ meta.hint }}</text>
  </view>
</template>

<style lang="scss" scoped>
.bucket-card {
  background: var(--bg);
  border-radius: 16rpx;
  padding: 20rpx;
  border-left: 4rpx solid var(--c);
}
.name {
  font-size: 24rpx;
  color: #4e5969;
}
.amount-row {
  display: flex;
  align-items: baseline;
  margin: 8rpx 0 4rpx;
  color: var(--c);
}
.unit {
  font-size: 22rpx;
  font-weight: 600;
  margin-right: 4rpx;
}
.amount {
  font-size: 36rpx;
  font-weight: 700;
  font-family: ui-monospace, monospace;
}
.hint {
  font-size: 20rpx;
  color: #86909c;
}
</style>
