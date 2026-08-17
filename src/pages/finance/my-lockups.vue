<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { fetchFinanceOrders, redeemFinanceOrder } from '@/service/api/finance';
import LockupCard from '@/components/finance/lockup-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useWalletStore } from '@/stores';

const walletStore = useWalletStore();
const activeKey = ref<Api.RealFinance.OrderStatus>('HOLDING');
const list = ref<Api.RealFinance.OrderVO[]>([]); const loading = ref(false);
const tabs: { key: Api.RealFinance.OrderStatus; label: string }[] = [{ key: 'HOLDING', label: '持仓中' }, { key: 'SETTLED', label: '已结算' }, { key: 'REDEEMED', label: '已赎回' }, { key: 'CANCELED', label: '已取消' }];
async function load() { loading.value = true; try { list.value = (await fetchFinanceOrders({ pageSize: 50, status: activeKey.value })).records; } finally { loading.value = false; } }
onMounted(load); watch(activeKey, load);
function onRedeem(order: Api.RealFinance.OrderVO) { uni.showModal({ title: '提前赎回？', content: `预计可得收益 U ${order.redeemableInterest ?? 0}，以提交后后端结果为准。`, confirmText: '确认赎回', success: async result => { if (!result.confirm) return; await redeemFinanceOrder(order.id); await walletStore.refetch(); await load(); uni.showToast({ title: '已提交赎回', icon: 'success' }); } }); }
</script>

<template><view class="my-lockup-page"><wd-tabs v-model="activeKey" sticky><wd-tab v-for="tab in tabs" :key="tab.key" :name="tab.key" :title="tab.label" /></wd-tabs><view class="list"><view v-if="list.length"><LockupCard v-for="order in list" :key="order.id" :order="order" @redeem="onRedeem" /></view><EmptyState v-else-if="!loading" title="暂无持仓" /></view></view></template>
<style lang="scss" scoped>.my-lockup-page { min-height:100%; background:#f7f8fa; }.list { padding:16rpx; }</style>
