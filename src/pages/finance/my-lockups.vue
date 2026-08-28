<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { fetchFinanceOrders, redeemFinanceOrder } from '@/service/api/finance';
import LockupCard from '@/components/finance/lockup-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useWalletStore } from '@/stores';

const walletStore = useWalletStore();
const activeKey = ref<Api.RealFinance.OrderStatus>('HOLDING');
const list = ref<Api.RealFinance.OrderVO[]>([]); const loading = ref(false);
const redeemingId = ref<Api.RealFinance.Id>();
const tabs: { key: Api.RealFinance.OrderStatus; label: string }[] = [{ key: 'HOLDING', label: '持仓中' }, { key: 'SETTLED', label: '已结算' }, { key: 'REDEEMED', label: '已赎回' }, { key: 'CANCELED', label: '已取消' }];
async function load() { loading.value = true; try { list.value = (await fetchFinanceOrders({ pageSize: 50, status: activeKey.value })).records; } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '锁仓记录加载失败', icon: 'none' }); } finally { loading.value = false; } }
onMounted(load); watch(activeKey, load);
function onRedeem(order: Api.RealFinance.OrderVO) {
  if (!order.canRedeem || redeemingId.value !== undefined) return;
  uni.showModal({
    title: '提前赎回？',
    content: `预计可得收益 U ${order.redeemableInterest ?? 0}，提前赎回可能影响实际收益，确认后将立即提交。`,
    confirmText: '确认赎回',
    success: async result => {
      if (!result.confirm || redeemingId.value !== undefined) return;
      redeemingId.value = order.id;
      try {
        await redeemFinanceOrder(order.id);
        await Promise.all([walletStore.refetch(), load()]);
        uni.showToast({ title: '已提交赎回', icon: 'success' });
      } catch (error) {
        uni.showToast({ title: error instanceof Error ? error.message : '提前赎回失败', icon: 'none' });
      } finally {
        redeemingId.value = undefined;
      }
    }
  });
}
</script>

<template><view class="my-lockup-page yb-page yb-page--full-bleed"><wd-tabs v-model="activeKey" sticky><wd-tab v-for="tab in tabs" :key="tab.key" :name="tab.key" :title="tab.label" /></wd-tabs><view class="list"><view v-if="list.length"><LockupCard v-for="order in list" :key="order.id" :order="order" :redeeming="redeemingId === order.id" :redeem-disabled="redeemingId !== undefined" @redeem="onRedeem" /></view><view v-else-if="loading" class="loading"><wd-loading size="44rpx" /><text>正在加载持仓</text></view><EmptyState v-else title="暂无持仓" /></view></view></template>
<style lang="scss" scoped>.my-lockup-page { min-height:100%; }.list { padding:24rpx; }.loading { display:flex; flex-direction:column; align-items:center; padding:96rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }</style>
