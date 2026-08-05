<script setup lang="ts">
import { ref } from 'vue';
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import { fetchRechargePage } from '@/service/api/wallet';
import { formatAmount } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';
import EmptyState from '@/components/common/empty-state.vue';

const list = ref<Api.RealWallet.RechargeVO[]>([]);
const loading = ref(false);
const pageNo = ref(1);
const total = ref(0);
const pageSize = 50;
let loadToken = 0;

function statusType(status: Api.RealWallet.RechargeStatus): 'success' | 'warning' | 'danger' {
  if (status === 'CONFIRMED') return 'success';
  if (status === 'CANCELED') return 'danger';
  return 'warning';
}

function formatTime(value?: string | number): string {
  if (!value) return '-';
  const date = typeof value === 'number' ? new Date(value) : /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

async function load(reset = true) {
  if (loading.value && !reset) return;
  const targetPage = reset ? 1 : pageNo.value + 1;
  const token = ++loadToken;
  loading.value = true;
  try {
    const page = await fetchRechargePage({ pageNo: targetPage, pageSize });
    if (token !== loadToken) return;
    const records = page.records || [];
    list.value = reset ? records : list.value.concat(records);
    pageNo.value = page.pageNo || targetPage;
    total.value = page.total;
  } catch (error) {
    if (token !== loadToken) return;
    uni.showToast({ title: error instanceof Error ? error.message : '充值记录加载失败', icon: 'none' });
  } finally {
    if (token === loadToken) {
      loading.value = false;
      uni.stopPullDownRefresh();
    }
  }
}

onShow(() => load());
onPullDownRefresh(() => load());
onReachBottom(() => {
  if (list.value.length < total.value) load(false);
});
</script>

<template>
  <view class="list-page">
    <view v-if="list.length" class="list">
      <view
        v-for="item in list"
        :key="String(item.id)"
        class="record-card"
        @click="go(`/pages/wallet/recharge-detail?id=${encodeURIComponent(String(item.id))}`)"
      >
        <view class="head"><text class="chain">USDT-{{ item.chain }}</text><wd-tag :type="statusType(item.status)">{{ item.statusText || item.status }}</wd-tag></view>
        <text class="amount">+ U {{ formatAmount(item.amount) }}</text>
        <view class="foot"><text>{{ formatTime(item.createdAt) }}</text><text>详情 ›</text></view>
      </view>
    </view>
    <EmptyState v-else-if="!loading" title="暂无充值记录" action-text="发起充值" @action="go('/pages/wallet/deposit')" />
    <view v-if="loading" class="loading">加载中...</view>
  </view>
</template>

<style lang="scss" scoped>
.list-page { min-height: 100vh; padding: 16rpx; box-sizing: border-box; background: #f7f8fa; }
.record-card { margin-bottom: 12rpx; padding: 24rpx; border-radius: 16rpx; background: #fff; }
.head, .foot { display: flex; align-items: center; justify-content: space-between; }
.chain { font-size: 24rpx; font-weight: 600; color: #1d2129; }
.amount { display: block; margin: 18rpx 0; font-size: 36rpx; font-weight: 700; color: #00b42a; font-family: ui-monospace, monospace; }
.foot { color: #86909c; font-size: 22rpx; }
.loading { padding: 32rpx; text-align: center; color: #86909c; font-size: 24rpx; }
</style>
