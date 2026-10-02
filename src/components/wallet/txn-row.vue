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
const sign = computed(() => (props.txn.direction === 'transfer' ? '' : props.txn.direction === 'in' ? '+' : '-'));
const amountColor = computed(() => (props.txn.direction === 'transfer' ? '#4e5969' : props.txn.direction === 'in' ? '#00b42a' : '#f53f3f'));
const desc = computed(() => props.txn.remark || (props.txn.refId != null ? `关联单号 ${props.txn.refId}` : '') || meta.value.label);
</script>

<template>
  <view class="txn-row" @click="$emit('detail', txn)">
    <view class="left">
      <text class="type">{{ txn.typeText || meta.label }}</text>
      <text class="desc">{{ desc }}</text>
      <text class="time">{{ new Date(txn.createdAt).toLocaleString() }}</text>
    </view>
    <view class="right">
      <text class="amount" :style="{ color: amountColor }">{{ sign }}{{ formatAmount(txn.amount) }} <text class="unit">USDT</text></text>
      <view class="detail-hint"><text>查看明细</text><wd-icon name="arrow-right" size="12px" /></view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.txn-row {
  gap: 16rpx;
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
.detail-hint { display:flex; justify-content:flex-end; align-items:center; gap:4rpx; margin-top:8rpx; font-size:22rpx; color:var(--yb-muted); }.type {
  display: inline-block;
  background: transparent;
  color: var(--yb-muted);
  padding: 0;
  border-radius: 4rpx;
  font-size: 26rpx;
  font-weight: 600;
}
.desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 26rpx;
  color: #1d2129;
  margin-top: 8rpx;
}
.time {
  display: block;
  font-size: 24rpx;
  color: var(--yb-muted);
  margin-top: 4rpx;
}
.right {
  text-align: right;
  flex: 0 1 48%;
  max-width: 48%;
  min-width: 0;
  overflow-wrap: anywhere;
}
.amount {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  font-family: var(--yb-font-body);
}
.unit { font-size: 24rpx; font-weight: 400; color: var(--yb-muted); }
.balance {
  display: block;
  font-size: 24rpx;
  color: var(--yb-muted);
  margin-top: 4rpx;
}
</style>
