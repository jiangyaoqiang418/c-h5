<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchWithdrawDetail } from '@/service/api/wallet';
import { formatAmount } from '@/utils/format-bridge';

const detail = ref<Api.RealWallet.WithdrawVO>();

function copy(value?: string) {
  if (value) uni.setClipboardData({ data: value, success: () => uni.showToast({ title: '已复制', icon: 'none' }) });
}

function formatTime(value?: string | number): string {
  if (!value) return '-';
  const date = typeof value === 'number' ? new Date(value) : /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

async function load(id: string) {
  try {
    detail.value = await fetchWithdrawDetail(id);
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '提现详情加载失败', icon: 'none' });
  }
}

onLoad(query => load(String(query?.id || '')));
</script>

<template>
  <view v-if="detail" class="detail-page yb-page">
    <view class="summary">
      <text class="status">{{ detail.statusText || detail.status }}</text>
      <text class="amount">U {{ formatAmount(detail.amount) }}</text>
      <text class="chain">USDT-{{ detail.chain }}</text>
    </view>
    <view class="section">
      <view class="row"><text class="label">提现单 ID</text><text>{{ detail.id }}</text></view>
      <view v-if="detail.fee !== undefined" class="row"><text class="label">手续费</text><text>U {{ formatAmount(detail.fee) }}</text></view>
      <view v-if="detail.actualAmount !== undefined" class="row"><text class="label">实际到账</text><text>U {{ formatAmount(detail.actualAmount) }}</text></view>
      <view class="block"><text class="label">到账地址</text><text class="block-value">{{ detail.toAddress || '-' }}</text><wd-button plain size="small" @click="copy(detail.toAddress)">复制地址</wd-button></view>
      <view v-if="detail.txHash" class="block"><text class="label">交易哈希</text><text class="block-value">{{ detail.txHash }}</text><wd-button plain size="small" @click="copy(detail.txHash)">复制哈希</wd-button></view>
      <view v-if="detail.payoutId" class="row"><text class="label">链上打款单</text><text>{{ detail.payoutId }}</text></view>
      <view v-if="detail.payoutStatus" class="row"><text class="label">链上打款状态</text><text>{{ detail.payoutStatus }}</text></view>
      <view v-if="detail.networkFee !== undefined" class="row"><text class="label">网络手续费</text><text>{{ detail.networkFee }} {{ detail.networkFeeSymbol || 'USDT' }}</text></view>
      <view v-if="detail.blockHeight !== undefined" class="row"><text class="label">区块高度</text><text>{{ detail.blockHeight }}</text></view>
      <view v-if="detail.reviewComment" class="block"><text class="label">审核意见</text><text class="reason">{{ detail.reviewComment }}</text></view>
      <view v-if="detail.failReason" class="block"><text class="label">失败原因</text><text class="reason">{{ detail.failReason }}</text></view>
      <view class="row"><text class="label">创建时间</text><text>{{ formatTime(detail.createdAt) }}</text></view>
      <view v-if="detail.paidAt" class="row"><text class="label">支付时间</text><text>{{ formatTime(detail.paidAt) }}</text></view>
      <view v-if="detail.submittedAt" class="row"><text class="label">已提交链上</text><text>{{ formatTime(detail.submittedAt) }}</text></view>
      <view v-if="detail.dispatchedAt" class="row"><text class="label">已派发打款</text><text>{{ formatTime(detail.dispatchedAt) }}</text></view>
      <view class="row"><text class="label">完成时间</text><text>{{ formatTime(detail.confirmedAt) }}</text></view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.detail-page { min-height: 100%; padding: 20rpx 24rpx 32rpx; box-sizing: border-box; }
.summary, .section { margin-bottom: 20rpx; padding: 24rpx; border:1rpx solid var(--yb-border); border-radius: var(--yb-radius-lg); background: #fff; box-shadow:var(--yb-shadow-card); }
.summary { text-align: center; }
.status, .chain { display: block; color: #86909c; font-size: 23rpx; }
.amount { display: block; margin: 14rpx 0; color: #f53f3f; font-size: 52rpx; font-weight: 700; font-family: ui-monospace, monospace; }
.row { display: flex; justify-content: space-between; gap: 20rpx; padding: 20rpx 0; border-bottom: 1rpx solid var(--yb-border); font-size: 23rpx; }
.label { color: #86909c; }
.block { padding: 20rpx 0; border-bottom: 1rpx solid var(--yb-border); }
.block-value, .reason { display: block; margin: 10rpx 0; padding: 14rpx; border-radius: 12rpx; background: #f5f5f2; font-size: 21rpx; line-height: 1.6; word-break: break-all; }
.block-value { font-family: ui-monospace, monospace; }
.reason { color: #f53f3f; }
</style>
