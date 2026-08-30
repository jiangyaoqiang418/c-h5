<script setup lang="ts">
import { usePrivatePagedList } from '@/utils/private-paged-list';
import { fetchWithdrawPage } from '@/service/api/wallet';
import { formatAmount } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const { list, loading, loadFailed, hasMore, load, retry, login, canOpen } = usePrivatePagedList<Api.RealWallet.WithdrawVO>({
  url: '/pages/wallet/withdraw-list',
  key: item => item.id,
  fetch: (pageNo, pageSize) => fetchWithdrawPage({ pageNo, pageSize })
});
function open(item: Api.RealWallet.WithdrawVO) {
  if (canOpen(item)) go(`/pages/wallet/withdraw-detail?id=${encodeURIComponent(String(item.id))}`);
}

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

</script>

<template>
  <view class="list-page yb-page">
    <view v-if="list.length" class="list">
      <view
        v-for="item in list"
        :key="String(item.id)"
        class="record-card"
        @click="open(item)"
      >
        <view class="head"><text class="chain">USDT-{{ item.chain }}</text><wd-tag round :type="statusType(item.status)">{{ item.statusText || item.status }}</wd-tag></view>
        <text class="amount">- U {{ formatAmount(item.amount) }}</text>
        <text class="address">{{ item.toAddress || '-' }}</text>
        <view class="foot"><text>{{ formatTime(item.createdAt) }}</text><view class="detail-link"><text>详情</text><wd-icon name="arrow-right" size="14px" color="#86909c" /></view></view>
      </view>
    </view>
    <EmptyState v-else-if="loadFailed" title="提现记录加载失败" description="请稍后重试" />
    <EmptyState v-else-if="!loading && !userStore.currentUser" title="请先登录查看提现记录" action-text="登录" @action="login" />
    <EmptyState v-else-if="!loading" title="暂无提现记录" action-text="发起提现" @action="go('/pages/wallet/withdraw')" />
    <wd-button v-if="loadFailed" block plain :loading="loading" @click="retry">读取失败，点击重试{{ list.length ? '（当前为上次记录）' : '' }}</wd-button>
    <wd-button v-else-if="userStore.currentUser && hasMore" block plain :loading="loading" @click="load(false)">加载更多</wd-button>
    <view v-if="loading" class="loading"><wd-loading size="44rpx" color="var(--yb-brand)" /><text>正在加载提现记录</text></view>
  </view>
</template>

<style lang="scss" scoped>
.list-page { min-height:100%; padding:24rpx; box-sizing:border-box; }.record-card { margin-bottom:16rpx; padding:24rpx; border-radius:var(--yb-radius-lg); background:#fff; border:1rpx solid var(--yb-border); box-shadow:var(--yb-shadow-card); }
.head, .foot { display: flex; align-items: center; justify-content: space-between; }
.chain { font-size: 24rpx; font-weight: 600; color: #1d2129; }
.amount { display: block; margin: 18rpx 0 8rpx; font-size: 36rpx; font-weight: 700; color: #f53f3f; font-family: ui-monospace, monospace; }
.address { display: block; margin-bottom: 16rpx; color: #86909c; font-size: 21rpx; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.foot { color: #86909c; font-size: 22rpx; }
.detail-link { display:flex; align-items:center; gap:4rpx; }
.loading { display:flex; flex-direction:column; align-items:center; padding:96rpx 0; gap:16rpx; color:#86909c; font-size:24rpx; }
</style>
