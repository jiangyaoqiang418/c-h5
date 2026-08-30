<script setup lang="ts">
import { ref } from 'vue';
import { usePrivatePagedList } from '@/utils/private-paged-list';
import TxnRow from '@/components/wallet/txn-row.vue';
import TxnDetailPopup from '@/components/wallet/txn-detail-popup.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { fetchWalletLedger, type WalletTxnView } from '@/service/api/wallet';

const userStore = useUserStore();
const popupOpen = ref(false);
const drawerTxn = ref<WalletTxnView>();
const { list, loading, loadFailed, hasMore, load, retry, login, canOpen } = usePrivatePagedList<WalletTxnView>({
  url: '/pages/wallet/history',
  key: item => item.id,
  fetch: (current, size) => fetchWalletLedger({ current, size }),
  resetView: () => { popupOpen.value = false; drawerTxn.value = undefined; }
});

function openTxn(t: WalletTxnView) {
  if (!canOpen(t)) return;
  drawerTxn.value = t;
  popupOpen.value = true;
}
</script>

<template>
  <view class="history-page yb-page">
    <view v-if="list.length" class="list">
      <TxnRow v-for="t in list" :key="t.id" :txn="t" @detail="openTxn" />
    </view>
    <EmptyState v-else-if="loadFailed" title="流水加载失败" description="请稍后重试" />
    <EmptyState v-else-if="!loading && !userStore.currentUser" title="请先登录查看流水" action-text="登录" @action="login" />
    <EmptyState v-else-if="!loading" title="暂无流水" />
    <view v-if="loading" class="loading"><wd-loading size="44rpx" color="var(--yb-brand)" /><text>正在加载资金流水</text></view>
    <wd-button v-if="loadFailed" block plain :loading="loading" @click="retry">读取失败，点击重试{{ list.length ? '（当前为上次记录）' : '' }}</wd-button>
    <wd-button v-else-if="userStore.currentUser && hasMore" block plain :loading="loading" @click="load(false)">加载更多</wd-button>
    <TxnDetailPopup v-model:visible="popupOpen" :txn="drawerTxn" />
  </view>
</template>

<style lang="scss" scoped>
.history-page { min-height: 100%; padding:20rpx 24rpx 32rpx; }
.list {
  overflow:hidden; background: #fff; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card);
}
.loading {
  display:flex;
  flex-direction:column;
  align-items:center;
  padding:96rpx 0;
  gap:16rpx;
  color: #86909c;
  font-size: 24rpx;
}
</style>
