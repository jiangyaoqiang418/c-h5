<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { fetchFinanceOverview, fetchFinanceProducts } from '@/service/api/finance';
import { go } from '@/utils/navigate';
import FinanceProductCard from '@/components/finance/finance-product-card.vue';
import EarnHero from '@/components/finance/earn-hero.vue';
import EarnChartCard from '@/components/finance/earn-chart-card.vue';
import EmptyState from '@/components/common/empty-state.vue';

const products = ref<Api.RealFinance.ProductVO[]>([]);
const overview = ref<Api.RealFinance.OverviewVO>({ holdingPrincipal: 0, totalInterest: 0, pendingInterest: 0, expectedInterest: 0, holdingCount: 0 });
const loading = ref(false);
async function load() { loading.value = true; try { [products.value, overview.value] = await Promise.all([fetchFinanceProducts(), fetchFinanceOverview()]); } finally { loading.value = false; } }
onMounted(load);
const bestApy = computed(() => Math.max(0, ...products.value.map(item => Number(item.annualRate) * 100)));
function goDeposit() { uni.pageScrollTo({ selector: '.list-section', duration: 300 }); }
</script>

<template>
  <view class="finance-page yb-page"><EarnHero :balance="String(overview.holdingPrincipal)" :best-apy="bestApy" :on-deposit="goDeposit" :on-withdraw="() => go('/pages/finance/my-lockups')" /><EarnChartCard :earnings="String(overview.totalInterest)" /><view class="summary">待结算收益 U {{ overview.pendingInterest }} · 预计到期收益 U {{ overview.expectedInterest }}</view><view class="list-section"><view v-if="products.length" class="list"><FinanceProductCard v-for="product in products" :key="product.id" :product="product" /></view><view v-else-if="loading" class="loading"><wd-loading size="44rpx" /><text>正在加载小金库产品</text></view><EmptyState v-else title="暂无小金库产品" /></view></view>
</template>

<style lang="scss" scoped>.finance-page { min-height:100%; padding-bottom:60rpx; }.summary { margin:0 24rpx 20rpx; background:#fff; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); padding:20rpx; color:#4e5969; font-size:23rpx; }.list-section { padding:0 24rpx; }.loading { display:flex; flex-direction:column; align-items:center; padding:96rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }</style>
