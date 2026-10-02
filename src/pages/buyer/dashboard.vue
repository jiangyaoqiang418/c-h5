<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import { getAccessToken } from '@/service/request/token';
import { avatarUrl } from '@shared/utils/image';
import { formatAmount } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';
import { fetchBuyerDepositSummary, fetchBuyerBusinessStats } from '@/service/api/buyer';
import { fetchSoldOrders } from '@/service/api/order';
import { fetchMyProducts } from '@/service/api/product';
import { fetchHall } from '@/service/api/purchase';
import BuyerKpiCard from '@/components/buyer/buyer-kpi-card.vue';
import BuyerOrderCard from '@/components/buyer/buyer-order-card.vue';
import PurchaseRequestCard from '@/components/purchase/purchase-request-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { UI_ASSETS } from '@/constants/ui-assets';

const userStore = useUserStore();
const orders = ref<Api.RealOrder.OrderView[]>([]);
const requests = ref<Api.PurchaseRequest.PurchaseRequest[]>([]);
const orderTotal = ref(0);
const productTotal = ref(0);
const requestTotal = ref(0);
const depositBalance = ref<string | number>();
const loading = ref(false);
const ordersLoadFailed = ref(false);
const requestsLoadFailed = ref(false);
const productsLoadFailed = ref(false);
const depositLoadFailed = ref(false);
const businessStats = ref<Api.RealOrder.BusinessStats>();
const statsFailed = ref(false);
let loadSequence = 0;

const user = computed(() => userStore.currentUser);
const userAvatar = computed(() => user.value?.avatar || (user.value ? avatarUrl(0) : ''));

async function load() {
  const sequence = ++loadSequence;
  loading.value = true;
  ordersLoadFailed.value = false;
  requestsLoadFailed.value = false;
  productsLoadFailed.value = false;
  depositLoadFailed.value = false;
  businessStats.value = undefined; statsFailed.value = false;
  try {
    await userStore.init();
    if (!userStore.currentUser) {
      orders.value = [];
      requests.value = [];
      orderTotal.value = 0;
      productTotal.value = 0;
      requestTotal.value = 0;
      depositBalance.value = undefined;
      return;
    }
    const userId = userStore.realUserId;
    const sessionToken = getAccessToken();
    const results = await Promise.allSettled([
      fetchSoldOrders({ pageNo: 1, pageSize: 5 }),
      fetchHall({ current: 1, size: 5 }),
      fetchMyProducts({ pageNo: 1, pageSize: 1, status: 'ON_SALE' }),
      fetchBuyerDepositSummary(),
      userStore.currentUser.isBuyer ? fetchBuyerBusinessStats() : Promise.resolve(undefined)
    ]);
    const [soldOrders, demandHall, products, deposits, stats] = results;
    if (sequence !== loadSequence || userId !== userStore.realUserId || sessionToken !== getAccessToken()) return;
    ordersLoadFailed.value = soldOrders.status === 'rejected';
    requestsLoadFailed.value = demandHall.status === 'rejected';
    productsLoadFailed.value = products.status === 'rejected';
    depositLoadFailed.value = deposits.status === 'rejected';
    statsFailed.value = stats.status === 'rejected';
    if (stats.status === 'fulfilled' && stats.value) {
      if (String(stats.value.sellerId) === userId) businessStats.value = stats.value;
      else statsFailed.value = true;
    }
    if (soldOrders.status === 'fulfilled') {
      orders.value = soldOrders.value.records;
      orderTotal.value = soldOrders.value.total;
    }
    if (demandHall.status === 'fulfilled') {
      requests.value = demandHall.value.records;
      requestTotal.value = demandHall.value.total;
    }
    if (products.status === 'fulfilled') productTotal.value = products.value.total;
    if (deposits.status === 'fulfilled') depositBalance.value = deposits.value.depositBalance;
    if (results.some(result => result.status === 'rejected')) {
      uni.showToast({ title: '部分买手数据加载失败', icon: 'none' });
    }
  } catch (error) {
    if (sequence !== loadSequence) return;
    ordersLoadFailed.value = true;
    requestsLoadFailed.value = true;
    productsLoadFailed.value = true;
    depositLoadFailed.value = true;
    statsFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '买手数据加载失败', icon: 'none' });
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}
onShow(load);
onHide(() => { loadSequence++; loading.value = false; businessStats.value = undefined; });

const kpis = computed(() => {
  return [
    { label: '在售商品', value: loading.value || !user.value || productsLoadFailed.value ? '—' : productTotal.value, unit: '件', icon: UI_ASSETS.placeholders.product, color: '#5B5CE7', description: '当前在售商品数量', url: '/pages/buyer/products?tab=ON_SALE' },
    { label: '卖出订单', value: loading.value || !user.value || ordersLoadFailed.value ? '—' : orderTotal.value, unit: '单', icon: UI_ASSETS.illustrations.status, color: '#B8935A', description: '全部卖出订单', url: '/pages/order/list' },
    { label: '可接求购', value: loading.value || !user.value || requestsLoadFailed.value ? '—' : requestTotal.value, unit: '单', icon: UI_ASSETS.illustrations.purchase, color: '#00A88A', description: '求购大厅当前总数', url: '/pages/purchase/hall' },
    { label: '保证金余额', value: loading.value || !user.value || depositLoadFailed.value || depositBalance.value == null ? '—' : formatAmount(depositBalance.value), unit: 'USDT', icon: UI_ASSETS.illustrations.buyerDeposit, color: '#7C5CFC', description: '查看保证金明细', url: '/pages/buyer/deposit' }
  ];
});

</script>

<template>
  <view class="dash-page">
    <!-- Hero -->
    <view class="hero">

      <view class="hero-top">
        <image v-if="userAvatar" :src="userAvatar" class="hero-avatar" />
        <view class="hero-user">
          <text class="hero-eyebrow">买手工作台</text>
          <view class="hero-name-row">
            <text class="hero-name">{{ user?.nickname || '买手' }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="section work-entry-section">
      <text class="section-title">工作入口</text>
      <view class="work-entries">
        <view class="work-entry" @click="go('/pages/order/list?status=PAID')"><text class="entry-title">待发货订单</text><text>核对并填写发货</text><wd-icon name="arrow-right" size="14px" /></view>
        <view class="work-entry" @click="go('/pages/aftersale/list')"><text class="entry-title">售后记录</text><text>查看当前处理进度</text><wd-icon name="arrow-right" size="14px" /></view>
        <view class="work-entry" @click="go('/pages/buyer/products?tab=PENDING')"><text class="entry-title">商品审核</text><text>查看送审状态</text><wd-icon name="arrow-right" size="14px" /></view>
      </view>
    </view>

    <!-- 固定四项指标在手机端完整展示，不使用横向滚动。 -->
    <view class="kpi-row">
      <BuyerKpiCard v-for="k in kpis" :key="k.label" :label="k.label" :value="k.value" :unit="k.unit" :icon="k.icon" :color="k.color" :description="k.description" @click="go(k.url)" />
    </view>

    <!-- 进行中订单 -->
    <view v-if="user?.isBuyer" class="section business-stats">
      <view class="section-bar"><text class="section-title">经营数据</text><text class="stats-note">全部时间</text></view>
      <view v-if="businessStats" class="stats-card">
        <view class="stats-row"><view><text class="stats-label">评价率</text><text class="stats-note">有效评价 {{ businessStats.reviewedOrderCount }} / 完成订单 {{ businessStats.completedOrderCount }}</text></view><text class="stats-value">{{ businessStats.reviewRate }}%</text></view>
        <view class="stats-row"><view><text class="stats-label">客诉率</text><text class="stats-note">售后 {{ businessStats.refundCount }} / 下单 {{ businessStats.orderCount }}</text></view><text class="stats-value">{{ businessStats.complaintRate }}%</text></view>
        <view class="stats-row"><view><text class="stats-label">平均发货</text><text class="stats-note">{{ businessStats.shippedOrderCount }} 笔有效样本</text></view><text class="stats-value">{{ businessStats.avgShipDurationHours }} 小时</text></view>
        <text class="stats-note">评价按评价时间、完成订单按完成时间统计。</text>
      </view>
      <wd-button v-else-if="statsFailed" plain size="small" :loading="loading" @click="load">经营数据加载失败，重试</wd-button>
      <text v-else>经营数据加载中…</text>
    </view>
    <view class="section">
      <view class="section-bar">
        <view class="title-group">

          <text class="section-title">最近卖出订单</text>
        </view>
        <view class="more" @click="go('/pages/order/list')"><text>全部</text><wd-icon name="arrow-right" size="14px" /></view>
      </view>
      <text class="section-caption">仅展示最近 3 条记录，全部订单请进入列表查看。</text>
      <view v-if="orders.length">
        <view v-for="o in orders.slice(0, 3)" :key="String(o.id)" class="recent-order" :class="{ 'recent-order--pending': o.rawStatus === 'PAID' }">
          <view v-if="o.rawStatus === 'PAID'" class="pending-note"><text>此订单待发货</text><text class="pending-link" @click="go('/pages/order/list?status=PAID')">前往待发货列表</text></view>
          <BuyerOrderCard :order="o" :show-actions="false" compact />
        </view>
      </view>
      <EmptyState v-else-if="ordersLoadFailed" title="卖出订单加载失败" description="请稍后重试" />
      <view v-else-if="loading" class="section-loading">卖出订单加载中…</view>
      <EmptyState v-else title="暂无卖出订单" description="你的卖出订单会显示在这里，可前往现有求购大厅查看需求。" action-text="查看求购大厅" @action="go('/pages/purchase/hall')" />
    </view>

    <!-- 可接求购 -->
    <view class="section">
      <view class="section-bar">
        <view class="title-group">

          <text class="section-title">可接求购</text>
        </view>
        <view class="more" @click="go('/pages/purchase/hall')"><text>前往大厅</text><wd-icon name="arrow-right" size="14px" /></view>
      </view>
      <view v-if="requests.length">
        <PurchaseRequestCard v-for="r in requests.slice(0, 2)" :key="r.id" :request="r" mode="hall" />
      </view>
      <EmptyState v-else-if="requestsLoadFailed" title="求购大厅加载失败" description="请稍后重试" />
      <view v-else-if="loading" class="section-loading">求购数据加载中…</view>
      <view v-else class="compact-empty">当前暂无可接求购，可前往大厅查看。</view>
    </view>

    <!-- 押金 -->
    <view class="deposit-card" @click="go('/pages/buyer/deposit')">
      <view class="deposit-head">
        <view class="title-group">

          <text class="section-title">押金概况</text>
        </view>
        <view class="more"><text>押金管理</text><wd-icon name="arrow-right" size="14px" /></view>
      </view>
      <view class="deposit-total">
        <text class="dep-label">当前保证金余额</text>
        <view class="dep-amount">
          <text class="num">{{ loading || !user || depositLoadFailed || depositBalance == null ? '—' : formatAmount(depositBalance) }}</text>
          <text class="unit">USDT</text>
        </view>
      </view>
    </view>

    <view class="footer-space" />
  </view>
</template>

<style lang="scss" scoped>
.work-entry-section > .section-title { display: block; margin-bottom: 16rpx; }
.work-entries, .stats-card { border: 1rpx solid var(--yb-border); background: var(--yb-surface); border-radius: var(--yb-radius-lg); padding: 4rpx 24rpx; }
.work-entry { display: flex; align-items: center; gap: 16rpx; min-height: 88rpx; border-bottom: 1rpx solid var(--yb-border); font-size: 24rpx; color: var(--yb-muted); }
.work-entry:last-child { border-bottom: 0; }
.entry-title { flex: 1; color: var(--yb-ink); font-size: 26rpx; font-weight: 500; }
.stats-row { display: flex; align-items: center; gap: 16rpx; padding: 12rpx 0; border-bottom: 1rpx solid var(--yb-border); }
.stats-row > view { flex: 1; min-width: 0; }
.stats-label, .stats-row .stats-note { display: block; }
.stats-label { font-size: 26rpx; font-weight: 500; color: var(--yb-ink); }
.stats-value { color: var(--yb-ink); font-size: 30rpx; font-weight: 600; text-align: right; max-width: 40%; overflow-wrap: anywhere; }
.stats-card > .stats-note { display: block; margin: 16rpx 0; line-height: 1.6; }
.section-caption { display: block; margin-bottom: 16rpx; color: var(--yb-muted); font-size: 24rpx; line-height: 1.6; }
.recent-order--pending { border-left: 4rpx solid var(--yb-brand); border-radius: var(--yb-radius-lg); overflow: hidden; }
.pending-note { display: flex; align-items: center; justify-content: space-between; min-height: 80rpx; padding: 0 20rpx; color: var(--yb-brand); background: var(--yb-brand-soft); font-size: 24rpx; }
.pending-link { display: flex; align-items: center; min-height: 80rpx; }
.business-stats { font-size:26rpx; line-height:1.8; }
.stats-note { font-size:24rpx; color:var(--yb-muted); }
.dash-page {
  min-height: 100%;
  background: var(--yb-bg);
  padding-bottom: 60rpx;
}

/* Hero */
.hero {
  position: relative;
  background-color: var(--yb-surface);
  background-size: cover;
  background-position: center;
  color: var(--yb-ink);
  padding: 24rpx;
  overflow: hidden;
}
.hero-top {
  position: relative;
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-bottom: 0;
}
.hero-avatar {
  width: 88rpx;
  height: 88rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 3rpx solid rgba(255, 255, 255, 0.2);
}
.hero-user {
  flex: 1;
  min-width: 0;
}
.hero-eyebrow {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
  letter-spacing: 0;
  color: var(--yb-muted);
  margin-bottom: 6rpx;
}
.hero-name-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.hero-name {
  font-size: 40rpx;
  font-weight: 700;
  letter-spacing: -1rpx;
  min-width: 0;
  overflow-wrap: anywhere;
}
.strong { color: var(--yb-ink); font-weight: 700; }
.kpi-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  padding: 20rpx 24rpx 0;
}

/* Section */
.section {
  margin: 20rpx 24rpx 0;
}
.section-loading { padding: 48rpx 0; text-align: center; color: var(--yb-muted); font-size: 24rpx; }
.section-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12rpx 4rpx;
  margin-bottom: 8rpx;
}
.title-group {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.sec-tag {
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  font-size: 18rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
}
.sec-tag.primary {
  background: rgba(91, 92, 231, 0.1);
  color: #5B5CE7;
}
.sec-tag.gold {
  background: #F6EFE4;
  color: #B8935A;
}
.section-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #0F111A;
  letter-spacing: -0.5rpx;
}
.more {
  display: flex;
  align-items: center;
  gap: 4rpx;
  font-size: 24rpx;
  color: var(--yb-muted);
  min-height: 84rpx;
}

/* Deposit card */
.deposit-card {
  margin: 20rpx 24rpx 0;
  padding: 20rpx;
  background: #FFFFFF;
  border: 1rpx solid var(--yb-border);
  border-radius: var(--yb-radius-lg);
}
.deposit-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}
.deposit-progress {
  margin-bottom: 20rpx;
}
.progress-bar {
  height: 20rpx;
  background: #EDECE6;
  border-radius: 999rpx;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #B8935A 0%, #D4A574 100%);
  border-radius: 999rpx;
  transition: width 0.5s;
}
.progress-label {
  display: block;
  font-size: 24rpx;
  color: #6B7385;
  margin-top: 8rpx;
  font-family: ui-monospace, monospace;
}
.deposit-total {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.dep-label {
  font-size: 24rpx;
  color: var(--yb-muted);
  letter-spacing: 0;
  text-transform: uppercase;
}
.dep-amount {
  display: flex;
  align-items: baseline;
  gap: 4rpx;
  color: #0F111A;
  min-width: 0;
  max-width: 66%;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.dep-amount .unit {
  font-family: var(--yb-font-body);
  font-size: 24rpx;
  color: var(--yb-muted);
  font-weight: 600;
}
.dep-amount .num {
  font-family: var(--yb-font-body);
  font-size: 36rpx;
  font-weight: 700;
  letter-spacing: -1rpx;
  min-width: 0;
  overflow-wrap: anywhere;
}
.footer-space { height: 40rpx; }
.compact-empty { padding:24rpx; border-radius:var(--yb-radius-lg); background:var(--yb-surface); font-size:26rpx; color:var(--yb-muted); }
</style>
