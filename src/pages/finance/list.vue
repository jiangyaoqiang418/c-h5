<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { financeApi, vipApi } from '@shared';
import { go } from '@/utils/navigate';
import FinanceProductCard from '@/components/finance/finance-product-card.vue';
import EarnHero from '@/components/finance/earn-hero.vue';
import EarnChartCard from '@/components/finance/earn-chart-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';

const userStore = useUserStore();
const walletStore = useWalletStore();
const products = ref<Api.FinanceProduct.ProductRecord[]>([]);
const vipStatus = ref<Awaited<ReturnType<typeof vipApi.fetchMyVipStatus>>>();
const totalAccruedInterest = ref('0');
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    products.value = await financeApi.fetchFinanceProducts();
    if (userStore.currentUser) {
      await walletStore.fetchWallet(userStore.currentUser.id);
      vipStatus.value = await vipApi.fetchMyVipStatus(userStore.currentUser.id);
      const lockups = await financeApi.fetchMyLockups(userStore.currentUser.id);
      totalAccruedInterest.value = lockups.records.reduce((sum, o) => sum + Number(o.accruedInterest || 0), 0).toFixed(2);
    }
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const vipBonus = computed(() => {
  const cfg = vipStatus.value?.config;
  if (!cfg || vipStatus.value?.audience !== 'customer') return 0;
  return Number(cfg.customerBenefits?.interestRateBonus || 0);
});

const currentBalance = computed(() => {
  return walletStore.account?.lockedFinance || '0';
});

const bestApy = computed(() => {
  if (!products.value.length) return 0;
  const rates = products.value.map(p => Number(p.baseRate) + vipBonus.value);
  return Math.max(...rates);
});

const featuredProducts = computed(() => products.value.filter(p => p.lockupDays <= 30));
const strategyProducts = computed(() => products.value.filter(p => p.lockupDays > 30));

function goDeposit() {
  uni.pageScrollTo({ selector: '.list-section', duration: 300 });
}
function goWithdraw() {
  go('/pages/finance/my-lockups');
}
</script>

<template>
  <view class="finance-page">
    <EarnHero
      :balance="currentBalance"
      :best-apy="bestApy"
      :on-deposit="goDeposit"
      :on-withdraw="goWithdraw"
    />

    <EarnChartCard :earnings="totalAccruedInterest" />

    <view class="list-section">
      <template v-if="featuredProducts.length">
        <text class="sec-title">精选</text>
        <view class="list">
          <FinanceProductCard v-for="p in featuredProducts" :key="p.id" :product="p" :vip-bonus-rate="vipBonus" />
        </view>
      </template>

      <template v-if="strategyProducts.length">
        <text class="sec-title">策略金库</text>
        <view class="list">
          <FinanceProductCard v-for="p in strategyProducts" :key="p.id" :product="p" :vip-bonus-rate="vipBonus" />
        </view>
      </template>

      <EmptyState v-if="!loading && products.length === 0" title="暂无小金库产品" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.finance-page {
  min-height: 100%;
  background: #FAFAF7;
  padding-bottom: 60rpx;
}
.list-section {
  padding: 20rpx 24rpx;
}
.sec-title {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: #86909C;
  letter-spacing: 2rpx;
  margin: 32rpx 0 20rpx;
  padding-left: 8rpx;
}
</style>
