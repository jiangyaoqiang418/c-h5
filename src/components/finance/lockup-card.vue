<script setup lang="ts">
import { computed } from 'vue';
import { formatAmount, formatRate } from '@/utils/format-bridge';
interface Props { order: Api.RealFinance.OrderVO; redeeming?: boolean; redeemDisabled?: boolean; }
const props = defineProps<Props>(); defineEmits<{ (event: 'redeem', order: Api.RealFinance.OrderVO): void }>();
const label = computed(() => props.order.statusText || ({ HOLDING: '计息中', REDEEMED: '已提前赎回', SETTLED: '已到期结算', CANCELED: '已取消' }[props.order.status] || ''));
const progress = computed(() => props.order.status === 'SETTLED' ? 100 : Math.min(100, Math.max(0, Math.round(((props.order.heldDays || 0) / props.order.lockDays) * 100))));
</script>
<template>
  <view class="lockup-card">
    <view class="head"><view class="product"><text class="name">{{ order.productName }}</text><text class="code">#{{ order.productCode || order.id }}</text></view><wd-tag plain round size="small">{{ label }}</wd-tag></view>
    <view class="principal"><text class="lbl">本金</text><text class="principal-value">{{ formatAmount(order.principal) }} <text class="unit">USDT</text></text></view>
    <view class="row"><view class="cell"><text class="lbl">年化</text><text class="val">{{ formatRate(Number(order.annualRate)) }}</text></view><view class="cell"><text class="lbl">已计收益</text><text class="val">+ {{ formatAmount(order.accruedInterest) }} <text class="unit">USDT</text></text></view></view>
    <wd-progress v-if="order.status === 'HOLDING' || order.status === 'SETTLED'" :percentage="progress" :color="order.status === 'SETTLED' ? '#00b42a' : '#722ed1'" />
    <text v-if="order.status === 'HOLDING'" class="progress-hint">已持有 {{ order.heldDays || 0 }}/{{ order.lockDays }} 天 · 剩余 {{ order.remainingDays || 0 }} 天</text>
    <view v-if="order.canRedeem" class="actions"><wd-button type="error" plain size="small" :loading="redeeming" :disabled="redeemDisabled" @click="$emit('redeem', order)">提前赎回</wd-button></view>
  </view>
</template>
<style lang="scss" scoped>
.lockup-card { background:#fff; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); padding:24rpx; margin-bottom:16rpx; }
.head { display:flex; justify-content:space-between; align-items:flex-start; gap:16rpx; margin-bottom:20rpx; padding-bottom:16rpx; border-bottom:1rpx solid var(--yb-border); }.product { flex:1; min-width:0; }.name { display:block; font-size:28rpx; font-weight:600; color:var(--yb-ink); overflow-wrap:anywhere; }.code { display:block; margin-top:6rpx; font-size:24rpx; color:var(--yb-muted); font-family:ui-monospace,monospace; overflow-wrap:anywhere; }
.principal { margin-bottom:20rpx; }.principal-value { display:block; margin-top:8rpx; font-size:40rpx; font-weight:700; color:var(--yb-ink); overflow-wrap:anywhere; font-variant-numeric:tabular-nums; }.unit { font-size:24rpx; font-weight:400; color:var(--yb-muted); }
.row { display:flex; gap:20rpx; margin-bottom:20rpx; }.cell { flex:1; min-width:0; }.lbl { display:block; font-size:24rpx; color:var(--yb-muted); }.val { display:block; font-size:28rpx; font-weight:600; color:var(--yb-ink); margin-top:8rpx; overflow-wrap:anywhere; font-variant-numeric:tabular-nums; }.progress-hint { display:block; font-size:24rpx; line-height:1.5; color:var(--yb-muted); margin-top:12rpx; }.actions { display:flex; justify-content:flex-end; margin-top:20rpx; }
</style>
