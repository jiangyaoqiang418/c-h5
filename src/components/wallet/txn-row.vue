<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';
import { formatAmount } from '@/utils/format-bridge';
import type { WalletTxnView } from '@/service/api/wallet';

interface Props {
  txn: WalletTxnView;
}
const props = defineProps<Props>();
defineEmits<{ (e: 'detail', t: WalletTxnView): void }>();

const meta = computed(() => enums.TXN_TYPE_META[props.txn.type]);
const sign = computed(() => (props.txn.direction === 'in' ? '+' : '-'));
const amountColor = computed(() => (props.txn.direction === 'in' ? '#00b42a' : '#f53f3f'));
const desc = computed(() => props.txn.remark || `${props.txn.refType || ''} ${props.txn.refId || ''}`.trim() || meta.value.label);
</script>

<template>
  <view class="txn-row" @click="$emit('detail', txn)">
    <view class="left">
      <text class="type">{{ meta.label }}</text>
      <text class="desc">{{ desc }}</text>
      <text class="time">{{ new Date(txn.createdAt).toLocaleString() }}</text>
    </view>
    <view class="right">
      <text class="amount" :style="{ color: amountColor }">{{ sign }}{{ formatAmount(txn.amount) }} U</text>
      <text class="balance">余 {{ formatAmount(txn.balanceAfter) }}</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.txn-row {
  display: flex;
  justify-content: space-between;
  padding: 24rpx;
  background: #fff;
  border-bottom: 1rpx solid var(--yb-border);
}
.left {
  flex: 1;
  min-width: 0;
}
.type {
  display: inline-block;
  background: #fff1f2;
  color: var(--yb-brand);
  padding: 2rpx 12rpx;
  border-radius: 4rpx;
  font-size: 20rpx;
  font-weight: 500;
}
.desc {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 26rpx;
  color: #1d2129;
  margin-top: 8rpx;
}
.time {
  display: block;
  font-size: 20rpx;
  color: #86909c;
  margin-top: 4rpx;
}
.right {
  text-align: right;
  flex-shrink: 0;
}
.amount {
  font-size: 28rpx;
  font-weight: 700;
  font-family: ui-monospace, monospace;
}
.balance {
  display: block;
  font-size: 20rpx;
  color: #86909c;
  margin-top: 4rpx;
}
</style>
