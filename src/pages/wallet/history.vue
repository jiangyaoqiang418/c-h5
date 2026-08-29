<script setup lang="ts">
import { ref } from 'vue';
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app';
import TxnRow from '@/components/wallet/txn-row.vue';
import TxnDetailPopup from '@/components/wallet/txn-detail-popup.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { fetchWalletLedger, type WalletTxnView } from '@/service/api/wallet';

const userStore = useUserStore();
const list = ref<WalletTxnView[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const pageNo = ref(1);
const total = ref(0);
const pageSize = 50;
const popupOpen = ref(false);
const drawerTxn = ref<WalletTxnView>();
let loadToken = 0;

async function load(reset = true) {
  if (loading.value && !reset) return;
  if (reset) loadFailed.value = false;
  await userStore.init();
  if (!userStore.currentUser) return;
  const targetPage = reset ? 1 : pageNo.value + 1;
  const token = ++loadToken;
  loading.value = true;
  try {
    const r = await fetchWalletLedger({ current: targetPage, size: pageSize });
    if (token !== loadToken) return;
    list.value = reset ? r.records : list.value.concat(r.records);
    pageNo.value = r.current || targetPage;
    total.value = r.total;
  } catch (error) {
    if (token !== loadToken) return;
    if (!list.value.length) loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '流水加载失败', icon: 'none' });
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

function openTxn(t: WalletTxnView) {
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
    <EmptyState v-else-if="!loading" title="暂无流水" />
    <view v-if="loading" class="loading"><wd-loading size="44rpx" color="var(--yb-brand)" /><text>正在加载资金流水</text></view>
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
