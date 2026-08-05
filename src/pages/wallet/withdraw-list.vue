<script setup lang="ts">
import { ref } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import { fetchWithdrawPage } from '@/service/api/wallet';
import { formatAmount } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';
import EmptyState from '@/components/common/empty-state.vue';

const list = ref<Api.RealWallet.WithdrawVO[]>([]);
const loading = ref(false);

function statusType(status: Api.RealWallet.WithdrawStatus): 'success' | 'warning' | 'danger' {
  if (status === 'SUCCESS') return 'success';
  if (status === 'REJECTED') return 'danger';
  return 'warning';
}

function formatTime(value?: string | number): string {
  if (!value) return '-';
  const date = typeof value === 'number' ? new Date(value) : /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

async function load() {
  loading.value = true;
  try {
    const page = await fetchWithdrawPage({ pageSize: 50 });
    list.value = page.records || [];
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '提现记录加载失败', icon: 'none' });
  } finally {
    loading.value = false;
    uni.stopPullDownRefresh();
  }
}

onShow(load);
onPullDownRefresh(load);
</script>

<template>
  <view class="list-page">
    <view v-if="list.length" class="list">
      <view
        v-for="item in list"
        :key="String(item.id)"
        class="record-card"
        @click="go(`/pages/wallet/withdraw-detail?id=${encodeURIComponent(String(item.id))}`)"
      >
        <view class="head"><text class="chain">USDT-{{ item.chain }}</text><wd-tag :type="statusType(item.status)">{{ item.statusText || item.status }}</wd-tag></view>
        <text class="amount">- U {{ formatAmount(item.amount) }}</text>
        <text class="address">{{ item.toAddress || '-' }}</text>
        <view class="foot"><text>{{ formatTime(item.createdAt) }}</text><text>详情 ›</text></view>
      </view>
    </view>
    <EmptyState v-else-if="!loading" title="暂无提现记录" action-text="发起提现" @action="go('/pages/wallet/withdraw')" />
  </view>
</template>

<style lang="scss" scoped>
.list-page { min-height: 100vh; padding: 16rpx; box-sizing: border-box; background: #f7f8fa; }
.record-card { margin-bottom: 12rpx; padding: 24rpx; border-radius: 16rpx; background: #fff; }
.head, .foot { display: flex; align-items: center; justify-content: space-between; }
.chain { font-size: 24rpx; font-weight: 600; color: #1d2129; }
.amount { display: block; margin: 18rpx 0 8rpx; font-size: 36rpx; font-weight: 700; color: #f53f3f; font-family: ui-monospace, monospace; }
.address { display: block; margin-bottom: 16rpx; color: #86909c; font-size: 21rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.foot { color: #86909c; font-size: 22rpx; }
</style>
