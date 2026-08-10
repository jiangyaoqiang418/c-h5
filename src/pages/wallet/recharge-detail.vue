<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchRechargeDetail } from '@/service/api/wallet';
import { formatAmount } from '@/utils/format-bridge';

const detail = ref<Api.RealWallet.RechargeVO>();

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
    detail.value = await fetchRechargeDetail(id);
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '充值详情加载失败', icon: 'none' });
  }
}

onLoad(query => load(String(query?.id || '')));
</script>

<template>
  <view v-if="detail" class="detail-page">
    <view class="summary">
      <text class="status">{{ detail.statusText || detail.status }}</text>
      <text class="amount">U {{ formatAmount(detail.amount) }}</text>
      <text class="chain">{{ detail.chainLabel || `USDT-${detail.chain}` }}</text>
    </view>
    <view class="section">
      <view class="row"><text class="label">充值单 ID</text><text>{{ detail.id }}</text></view>
      <view class="block"><text class="label">平台充值地址</text><text class="block-value">{{ detail.depositAddress || '-' }}</text><wd-button plain size="small" @click="copy(detail.depositAddress)">复制地址</wd-button></view>
      <view class="block"><text class="label">转账备注</text><text class="block-value">{{ detail.memo || String(detail.id) }}</text><wd-button plain size="small" @click="copy(detail.memo || String(detail.id))">复制备注</wd-button></view>
      <view v-if="detail.txHash" class="block"><text class="label">交易哈希</text><text class="block-value">{{ detail.txHash }}</text><wd-button plain size="small" @click="copy(detail.txHash)">复制哈希</wd-button></view>
      <view class="row"><text class="label">创建时间</text><text>{{ formatTime(detail.createdAt) }}</text></view>
      <view class="row"><text class="label">到账时间</text><text>{{ formatTime(detail.confirmedAt) }}</text></view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.detail-page { min-height: 100%; padding: 16rpx; box-sizing: border-box; background: #f7f8fa; }
.summary, .section { margin-bottom: 16rpx; padding: 24rpx; border-radius: 16rpx; background: #fff; }
.summary { text-align: center; }
.status, .chain { display: block; color: #86909c; font-size: 23rpx; }
.amount { display: block; margin: 14rpx 0; color: #00b42a; font-size: 52rpx; font-weight: 700; font-family: ui-monospace, monospace; }
.row { display: flex; justify-content: space-between; gap: 20rpx; padding: 20rpx 0; border-bottom: 1rpx solid #f7f8fa; font-size: 23rpx; }
.label { color: #86909c; }
.block { padding: 20rpx 0; border-bottom: 1rpx solid #f7f8fa; }
.block-value { display: block; margin: 10rpx 0; padding: 14rpx; border-radius: 8rpx; background: #f7f8fa; font-size: 21rpx; font-family: ui-monospace, monospace; word-break: break-all; }
</style>
