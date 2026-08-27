<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { avatarUrl } from '@shared/utils/image';
import { formatAmount } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';
import { fetchBuyerDepositLedger } from '@/service/api/buyer';
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
const depositBalance = ref<string | number>(0);

const user = computed(() => userStore.currentUser);
const userAvatar = computed(() => user.value?.avatar || (user.value ? avatarUrl(0) : ''));

async function load() {
  await userStore.init();
  if (!userStore.currentUser) return;
  const results = await Promise.allSettled([
    fetchSoldOrders({ pageNo: 1, pageSize: 5 }),
    fetchHall({ current: 1, size: 5 }),
    fetchMyProducts({ pageNo: 1, pageSize: 1 }),
    fetchBuyerDepositLedger({ pageNo: 1, pageSize: 1 })
  ]);
  const [soldOrders, demandHall, products, deposits] = results;
  if (soldOrders.status === 'fulfilled') {
    orders.value = soldOrders.value.records;
    orderTotal.value = soldOrders.value.total;
  }
  if (demandHall.status === 'fulfilled') {
    requests.value = demandHall.value.records;
    requestTotal.value = demandHall.value.total;
  }
  if (products.status === 'fulfilled') productTotal.value = products.value.total;
  if (deposits.status === 'fulfilled') depositBalance.value = deposits.value.records[0]?.balanceAfter ?? 0;
  if (results.some(result => result.status === 'rejected')) {
    uni.showToast({ title: '部分买手数据加载失败', icon: 'none' });
  }
}
onShow(load);

const kpis = computed(() => {
  return [
    { label: '在售商品', value: productTotal.value, unit: '件', icon: 'goods', color: '#5B5CE7' },
    { label: '卖出订单', value: orderTotal.value, unit: '单', icon: 'cart', color: '#B8935A' },
    { label: '可接求购', value: requestTotal.value, unit: '单', icon: 'search', color: '#00A88A' },
    { label: '保证金余额', value: formatAmount(depositBalance.value), unit: 'U', icon: 'shield', color: '#7C5CFC' }
  ];
});

</script>

<template>
  <view class="dash-page">
    <!-- Hero -->
    <view class="hero" :style="{ backgroundImage: `url(${UI_ASSETS.backgrounds.buyer})` }">
      <view class="hero-glow"></view>
      <view class="hero-top">
        <image v-if="userAvatar" :src="userAvatar" class="hero-avatar" />
        <view class="hero-user">
          <text class="hero-eyebrow">BUYER STUDIO</text>
          <view class="hero-name-row">
            <text class="hero-name">{{ user?.nickname || '买手' }}</text>
          </view>
          <view class="hero-sub"><wd-icon name="check" size="13px" /> 已读取真实买手数据</view>
        </view>
      </view>
      <view class="hero-stats">
        <view class="stat">
          <text class="stat-label">卖出订单</text>
          <text class="stat-val">{{ orderTotal }}</text>
        </view>
        <view class="stat">
          <text class="stat-label">在售商品</text>
          <text class="stat-val">{{ productTotal }}</text>
        </view>
        <view class="stat">
          <text class="stat-label">可接求购</text>
          <text class="stat-val">{{ requestTotal }}</text>
        </view>
        <view class="stat">
          <text class="stat-label">保证金</text>
          <text class="stat-val">{{ formatAmount(depositBalance) }}</text>
        </view>
      </view>
    </view>

    <!-- KPI 横滑 -->
    <scroll-view scroll-x class="kpi-scroll">
      <view class="kpi-row">
        <BuyerKpiCard v-for="k in kpis" :key="k.label" v-bind="k" />
      </view>
    </scroll-view>

    <!-- 进行中订单 -->
    <view class="section">
      <view class="section-bar">
        <view class="title-group">
          <view class="sec-tag primary"><text>ORDERS</text></view>
          <text class="section-title">最近卖出订单</text>
        </view>
        <view class="more" @click="go('/pages/order/list')"><text>全部</text><wd-icon name="arrow-right" size="14px" /></view>
      </view>
      <view v-if="orders.length">
        <BuyerOrderCard v-for="o in orders" :key="String(o.id)" :order="o" :show-actions="false" />
      </view>
      <EmptyState v-else title="暂无卖出订单" description="去求购大厅接单赚取收益" />
    </view>

    <!-- 可接求购 -->
    <view class="section">
      <view class="section-bar">
        <view class="title-group">
          <view class="sec-tag gold"><text>CLAIMABLE</text></view>
          <text class="section-title">可接求购</text>
        </view>
        <view class="more" @click="go('/pages/purchase/hall')"><text>前往大厅</text><wd-icon name="arrow-right" size="14px" /></view>
      </view>
      <view v-if="requests.length">
        <PurchaseRequestCard v-for="r in requests" :key="r.id" :request="r" mode="hall" />
      </view>
      <EmptyState v-else title="暂无可接求购" description="新求购按 VIP 阶梯推送" />
    </view>

    <!-- 押金 -->
    <view class="deposit-card" @click="go('/pages/buyer/deposit')">
      <view class="deposit-head">
        <view class="title-group">
          <view class="sec-tag gold"><text>DEPOSIT</text></view>
          <text class="section-title">押金概况</text>
        </view>
        <view class="more"><text>押金管理</text><wd-icon name="arrow-right" size="14px" /></view>
      </view>
      <view class="deposit-progress"><text class="progress-label">以最新真实保证金流水余额为准</text></view>
      <view class="deposit-total">
        <text class="dep-label">当前保证金余额</text>
        <view class="dep-amount">
          <text class="unit">U</text>
          <text class="num">{{ formatAmount(depositBalance) }}</text>
        </view>
      </view>
    </view>

    <view class="footer-space" />
  </view>
</template>

<style lang="scss" scoped>
.dash-page {
  min-height: 100%;
  background: #FAFAF7;
  padding-bottom: 60rpx;
}

/* Hero */
.hero {
  position: relative;
  background-color: #10131f;
  background-size: cover;
  background-position: center;
  color: #FFFFFF;
  padding: 48rpx 32rpx 32rpx;
  overflow: hidden;
}
.hero-glow {
  position: absolute;
  top: -50%;
  right: -30%;
  width: 600rpx;
  height: 600rpx;
  background: radial-gradient(circle, rgba(184, 147, 90, 0.25) 0%, transparent 70%);
  pointer-events: none;
}
.hero-top {
  position: relative;
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-bottom: 40rpx;
}
.hero-avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 3rpx solid rgba(255, 255, 255, 0.2);
}
.hero-user {
  flex: 1;
}
.hero-eyebrow {
  display: block;
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 3rpx;
  color: #D4A574;
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
}
.hero-sub {
  display: flex;
  align-items: center;
  gap: 6rpx;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.72);
  margin-top: 6rpx;
}
.strong { color: #FFFFFF; font-weight: 700; }
.hero-stats {
  position: relative;
  display: flex;
  gap: 16rpx;
}
.stat {
  flex: 1;
  min-width: 0;
  padding: 16rpx;
  background: rgba(255, 255, 255, 0.08);
  border: 1rpx solid rgba(255, 255, 255, 0.12);
  border-radius: 16rpx;
}
.stat-label {
  display: block;
  font-size: 18rpx;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 2rpx;
  text-transform: uppercase;
  margin-bottom: 8rpx;
}
.stat-val {
  display: block;
  font-family: ui-monospace, monospace;
  font-size: 32rpx;
  font-weight: 700;
  letter-spacing: -1rpx;
}

/* KPI 横滑 */
.kpi-scroll {
  white-space: nowrap;
  padding: 24rpx 24rpx 8rpx;
}
.kpi-row {
  display: inline-flex;
  gap: 16rpx;
  padding: 4rpx;
}

/* Section */
.section {
  margin: 24rpx 32rpx 0;
}
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
  font-size: 22rpx;
  color: #6B7385;
}

/* Deposit card */
.deposit-card {
  margin: 24rpx 32rpx 0;
  padding: 28rpx;
  background: #FFFFFF;
  border: 1rpx solid #EDECE6;
  border-radius: 32rpx;
  box-shadow: 0 4rpx 16rpx rgba(15, 17, 26, 0.04);
}
.deposit-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
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
  font-size: 20rpx;
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
  font-size: 22rpx;
  color: #6B7385;
  letter-spacing: 2rpx;
  text-transform: uppercase;
}
.dep-amount {
  display: flex;
  align-items: baseline;
  gap: 4rpx;
  color: #0F111A;
}
.dep-amount .unit {
  font-family: ui-monospace, monospace;
  font-size: 24rpx;
  color: #B8935A;
  font-weight: 600;
}
.dep-amount .num {
  font-family: ui-monospace, monospace;
  font-size: 48rpx;
  font-weight: 700;
  letter-spacing: -1rpx;
}
.footer-space { height: 40rpx; }
</style>
