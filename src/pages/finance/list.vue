<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import { fetchFinanceOverview, fetchFinanceProducts } from '@/service/api/finance';
import { go, useNavigationGuards } from '@/utils/navigate';
import { usePageOperation } from '@/utils/page-operation';
import { normalizeAmount } from '@/utils/amount';
import { getAccessToken } from '@/service/request/token';
import FinanceProductCard from '@/components/finance/finance-product-card.vue';
import EarnHero from '@/components/finance/earn-hero.vue';
import EarnChartCard from '@/components/finance/earn-chart-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const { requireLogin } = useNavigationGuards();
const products = ref<Api.RealFinance.ProductVO[]>([]);
const overview = ref<Api.RealFinance.OverviewVO>();
const loading = ref(false);
const accountLoadFailed = ref(false);
const productsLoadFailed = ref(false);
const overviewLoadFailed = ref(false);
let loadVersion = 0;
const page = usePageOperation(() => {
  loadVersion++;
  products.value = [];
  overview.value = undefined;
  loading.value = false;
  accountLoadFailed.value = false;
  productsLoadFailed.value = false;
  overviewLoadFailed.value = false;
});
async function load() {
  if (!page.visible.value || loading.value) return;
  const operation = page.capture();
  const version = ++loadVersion;
  const current = () => operation.isCurrent() && version === loadVersion;
  loading.value = true;
  accountLoadFailed.value = false;
  productsLoadFailed.value = false;
  overviewLoadFailed.value = false;
  try {
    await userStore.init();
    if (!current()) return;
    if (!userStore.currentUser) {
      if (getAccessToken()) throw new Error('账户资料加载失败，请重试');
      products.value = [];
      overview.value = undefined;
      return;
    }
    await Promise.all([
      (async () => {
        try {
          const result = await fetchFinanceProducts();
          if (!current()) return;
          if (!Array.isArray(result)) throw new Error('产品记录无效');
          products.value = result;
        } catch { if (current()) productsLoadFailed.value = true; }
      })(),
      (async () => {
        try {
          const result = await fetchFinanceOverview();
          if (!current()) return;
          [result.holdingPrincipal, result.totalInterest, result.pendingInterest, result.expectedInterest].forEach(normalizeAmount);
          overview.value = result;
        } catch { if (current()) overviewLoadFailed.value = true; }
      })()
    ]);
  } catch (error) {
    if (!current()) return;
    accountLoadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '账户读取失败', icon: 'none' });
  } finally {
    if (current()) loading.value = false;
  }
}
onShow(load);
onHide(() => { loadVersion++; loading.value = false; });
const bestApy = computed(() => Math.max(0, ...products.value.map(item => Number(item.annualRate) * 100).filter(Number.isFinite)));
async function login() {
  const operation = page.capture();
  if (await requireLogin('/pages/finance/list') && operation.isCurrent()) await load();
}
function goDeposit() { if (page.visible.value) uni.pageScrollTo({ selector: '.list-section', duration: 300 }); }
</script>

<template>
  <view class="finance-page yb-page">
    <EmptyState v-if="accountLoadFailed" title="账户资料加载失败" action-text="重新加载" @action="load" />
    <EmptyState v-else-if="!loading && !userStore.currentUser" title="请先登录查看小金库" action-text="登录" @action="login" />
    <template v-else>
      <view v-if="loading" class="summary">正在更新小金库数据{{ overview ? '，当前展示上次读取结果' : '' }}</view>
      <wd-button v-if="overviewLoadFailed" block plain :loading="loading" @click="load">资产读取失败，点击重试{{ overview ? '（当前为上次结果）' : '' }}</wd-button>
      <template v-if="overview">
        <EarnHero :balance="String(overview.holdingPrincipal)" :best-apy="productsLoadFailed ? 0 : bestApy" :on-deposit="goDeposit" :on-withdraw="() => go('/pages/finance/my-lockups')" />
        <EarnChartCard :earnings="String(overview.totalInterest)" />
        <view class="summary">待结算收益 U {{ overview.pendingInterest }} · 预计到期收益 U {{ overview.expectedInterest }}</view>
      </template>
      <view v-else class="summary">资产及收益尚未读取，金额 —</view>
      <view class="list-section">
        <wd-button v-if="productsLoadFailed" block plain :loading="loading" @click="load">产品读取失败，点击重试{{ products.length ? '（当前为上次记录）' : '' }}</wd-button>
        <view v-if="products.length" class="list"><FinanceProductCard v-for="product in products" :key="product.id" :product="product" /></view>
        <view v-else-if="loading" class="loading"><wd-loading size="44rpx" /><text>正在加载小金库产品</text></view>
        <EmptyState v-else-if="!productsLoadFailed" title="暂无小金库产品" />
      </view>
    </template>
  </view>
</template>

<style lang="scss" scoped>.finance-page { min-height:100%; padding-bottom:60rpx; }.summary { margin:0 24rpx 20rpx; background:#fff; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); padding:20rpx; color:#4e5969; font-size:23rpx; }.list-section { padding:0 24rpx; }.loading { display:flex; flex-direction:column; align-items:center; padding:96rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }</style>
