<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { financeApi } from '@shared';
import LockupCard from '@/components/finance/lockup-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';

const userStore = useUserStore();
const walletStore = useWalletStore();
const activeKey = ref<Api.FinanceProduct.LockupStatus>('active');
const list = ref<Api.FinanceProduct.LockupOrder[]>([]);
const loading = ref(false);

const TABS: { key: Api.FinanceProduct.LockupStatus; label: string }[] = [
  { key: 'active', label: '持仓中' },
  { key: 'matured', label: '已到期' },
  { key: 'early_unlocked', label: '提前解锁' },
  { key: 'cancelled', label: '已取消' }
];

async function load() {
  if (!userStore.currentUser) return;
  loading.value = true;
  try {
    const r = await financeApi.fetchMyLockups(userStore.currentUser.id, activeKey.value);
    list.value = r.records;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(activeKey, load);

async function onUnlock(o: Api.FinanceProduct.LockupOrder) {
  const lost = Math.max(0, Number(o.expectedInterest) - Number(o.accruedInterest)).toFixed(2);
  uni.showModal({
    title: '提前解锁？',
    content: `将损失 U ${lost} 利息，本金将原路退回可用余额`,
    confirmText: '确认解锁',
    success: async r => {
      if (r.confirm) {
        const res = await financeApi.earlyUnlockMock(o.id);
        if (res.ok) {
          uni.showToast({ title: '已解锁', icon: 'success' });
          await walletStore.refetch();
          load();
        }
      }
    }
  });
}
</script>

<template>
  <view class="my-lockup-page">
    <wd-tabs v-model="activeKey" sticky>
      <wd-tab v-for="t in TABS" :key="t.key" :name="t.key" :title="t.label" />
    </wd-tabs>
    <view class="list">
      <view v-if="list.length">
        <LockupCard v-for="o in list" :key="o.id" :order="o" @unlock="onUnlock" />
      </view>
      <EmptyState v-else-if="!loading" title="暂无持仓" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.my-lockup-page {
  min-height: 100%;
  background: #f7f8fa;
}
.list {
  padding: 16rpx;
}
</style>
