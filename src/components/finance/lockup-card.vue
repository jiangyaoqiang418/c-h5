<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';
import { formatAmount, formatRate } from '@/utils/format-bridge';

interface Props {
  order: Api.FinanceProduct.LockupOrder;
}
const props = defineProps<Props>();
defineEmits<{ (e: 'unlock', o: Api.FinanceProduct.LockupOrder): void }>();

const meta = computed(() => enums.LOCKUP_ORDER_STATUS_META[props.order.status]);

const startMs = computed(() => new Date(props.order.startAt).getTime());
const maturityMs = computed(() => new Date(props.order.maturityAt).getTime());
const daysPassed = computed(() => {
  const now = Math.min(Date.now(), maturityMs.value);
  return Math.max(0, Math.floor((now - startMs.value) / 86400_000));
});
const progressPct = computed(() => {
  if (props.order.status === 'active')
    return Math.min(100, Math.round((daysPassed.value / props.order.lockupDays) * 100));
  if (props.order.status === 'matured') return 100;
  return 0;
});

const tagType = computed(() => {
  const m: Record<string, string> = { green: 'success', red: 'danger', orange: 'warning', blue: 'primary', gray: 'default' };
  return m[meta.value.color] || 'default';
});
</script>

<template>
  <view class="lockup-card">
    <view class="head">
      <view>
        <text class="name">{{ order.productName }}</text>
        <text class="code">#{{ order.code }}</text>
      </view>
      <wd-tag :type="tagType" plain size="small">{{ meta.label }}</wd-tag>
    </view>

    <view class="row">
      <view class="cell">
        <text class="lbl">本金</text>
        <text class="val">U {{ formatAmount(order.principalAmount) }}</text>
      </view>
      <view class="cell">
        <text class="lbl">利率</text>
        <text class="val rate">{{ formatRate(Number(order.rate.effectiveRate) / 100) }}</text>
      </view>
      <view class="cell">
        <text class="lbl">已累积</text>
        <text class="val interest">+ U {{ formatAmount(order.accruedInterest) }}</text>
      </view>
    </view>

    <wd-progress v-if="order.status === 'active' || order.status === 'matured'" :percentage="progressPct" :color="order.status === 'matured' ? '#00b42a' : '#722ed1'" />
    <text v-if="order.status === 'active'" class="progress-hint">
      已过 {{ daysPassed }}/{{ order.lockupDays }} 天 · 到期 {{ new Date(order.maturityAt).toLocaleDateString() }}
    </text>

    <view v-if="order.status === 'active'" class="actions">
      <wd-button type="error" plain size="small" @click="$emit('unlock', order)">提前解锁</wd-button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.lockup-card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16rpx;
  padding-bottom: 16rpx;
  border-bottom: 1rpx dashed #f2f3f5;
}
.name {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #1d2129;
}
.code {
  display: block;
  font-size: 20rpx;
  color: #86909c;
  font-family: ui-monospace, monospace;
}
.row {
  display: flex;
  gap: 16rpx;
  margin-bottom: 16rpx;
}
.cell {
  flex: 1;
}
.lbl {
  display: block;
  font-size: 20rpx;
  color: #86909c;
}
.val {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  font-family: ui-monospace, monospace;
  color: #1d2129;
  margin-top: 4rpx;
}
.val.rate { color: #722ed1; }
.val.interest { color: #00b42a; }
.progress-hint {
  display: block;
  font-size: 20rpx;
  color: #4e5969;
  margin-top: 8rpx;
}
.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 16rpx;
}
</style>
