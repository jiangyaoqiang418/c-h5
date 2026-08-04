<script setup lang="ts">
import { ref } from 'vue';
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app';
import TxnRow from '@/components/wallet/txn-row.vue';
import TxnDetailPopup from '@/components/wallet/txn-detail-popup.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { fetchWalletLedger } from '@/service/api/wallet';

const userStore = useUserStore();
const list = ref<Api.Wallet.Txn[]>([]);
const loading = ref(false);
const popupOpen = ref(false);
const drawerTxn = ref<Api.Wallet.Txn>();

async function load() {
  await userStore.init();
  if (!userStore.currentUser) return;
  loading.value = true;
  try {
    const r = await fetchWalletLedger({ size: 50 });
    list.value = r.records;
  } finally {
    loading.value = false;
    uni.stopPullDownRefresh();
  }
}
onShow(load);
onPullDownRefresh(load);

function openTxn(t: Api.Wallet.Txn) {
  drawerTxn.value = t;
  popupOpen.value = true;
}
</script>

<template>
  <view class="history-page">
    <view v-if="list.length" class="list">
      <TxnRow v-for="t in list" :key="t.id" :txn="t" @detail="openTxn" />
    </view>
    <EmptyState v-else-if="!loading" title="暂无流水" />
    <TxnDetailPopup v-model:visible="popupOpen" :txn="drawerTxn" />
  </view>
</template>

<style lang="scss" scoped>
.history-page {
  min-height: 100vh;
  background: #f7f8fa;
}
.list {
  background: #fff;
}
</style>
