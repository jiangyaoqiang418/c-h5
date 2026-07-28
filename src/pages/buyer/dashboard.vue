<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { buyerApi } from '@shared';
import { avatarUrl } from '@shared/utils/image';
import { formatAmount } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';
import BuyerKpiCard from '@/components/buyer/buyer-kpi-card.vue';
import BuyerOrderCard from '@/components/buyer/buyer-order-card.vue';
import PurchaseRequestCard from '@/components/purchase/purchase-request-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const orders = ref<Api.Order.OrderRecord[]>([]);
const requests = ref<Api.PurchaseRequest.PurchaseRequest[]>([]);
const deposit = ref<{ wallet?: any; profile?: any }>({});

const user = computed(() => userStore.currentUser);
const userAvatar = computed(() => (user.value ? avatarUrl(user.value.id) : ''));

async function load() {
  if (!userStore.currentUser) return;
  const buyerId = userStore.currentUser.id;
  const [ordRes, reqRes, depRes] = await Promise.all([
    buyerApi.fetchBuyerOrders(buyerId, ['PROCURING', 'PROCURED', 'IN_TRANSIT']),
    buyerApi.fetchClaimableRequests(buyerId),
    buyerApi.fetchBuyerDepositSummary(buyerId)
  ]);
  orders.value = ordRes.records.slice(0, 5);
  requests.value = reqRes.records.slice(0, 5);
  deposit.value = depRes;
}
onShow(load);

const stats = computed(() => {
  const p = deposit.value.profile;
  return {
    orderTotal: p?.stats?.orderTotal ?? 0,
    goodReviewRate: p?.stats?.goodReviewRate ?? '0',
    complaintRate: p?.stats?.complaintRate ?? '0',
    avgShipHours: p?.stats?.avgShipHours ?? 0
  };
});

const kpis = computed(() => {
  const w = deposit.value.wallet;
  const total = w ? Number(w.depositAvailable || 0) + Number(w.depositGuaranteed || 0) : 0;
  return [
    { label: '在售商品', value: deposit.value.profile?.productCount || 0, unit: '件', emoji: '🛍️', color: '#5B5CE7', delta: 8.4 },
    { label: '进行中订单', value: orders.value.length, unit: '单', emoji: '📦', color: '#B8935A', delta: 12.6 },
    { label: '可接求购', value: requests.value.length, unit: '单', emoji: '🎯', color: '#00A88A', delta: -2.1 },
    { label: '押金', value: formatAmount(total), unit: 'U', emoji: '🔒', color: '#7C5CFC', delta: 4.5 },
    { label: '本月收入', value: formatAmount(w?.monthlyIncome || 0), unit: 'U', emoji: '💰', color: '#E74C3C', delta: 22.4 }
  ];
});

const depositPct = computed(() => {
  const w = deposit.value.wallet;
  if (!w) return 0;
  const total = Number(w.depositAvailable || 0) + Number(w.depositGuaranteed || 0);
  return total > 0 ? (Number(w.depositGuaranteed || 0) / total) * 100 : 0;
});
const depositTotal = computed(() => {
  const w = deposit.value.wallet;
  if (!w) return '0.00';
  return formatAmount(Number(w.depositAvailable || 0) + Number(w.depositGuaranteed || 0));
});

async function refreshOrders() {
  if (!userStore.currentUser) return;
  const r = await buyerApi.fetchBuyerOrders(userStore.currentUser.id, ['PROCURING', 'PROCURED', 'IN_TRANSIT']);
  orders.value = r.records.slice(0, 5);
}
</script>

<template>
  <view class="dash-page">
    <!-- Hero -->
    <view class="hero">
      <view class="hero-glow"></view>
      <view class="hero-top">
        <image v-if="userAvatar" :src="userAvatar" class="hero-avatar" />
        <view class="hero-user">
          <text class="hero-eyebrow">BUYER STUDIO</text>
          <view class="hero-name-row">
            <text class="hero-name">{{ user?.nickname || '买手' }}</text>
          </view>
          <text class="hero-sub">✓ 累计完成 <text class="strong">{{ stats.orderTotal }}</text> 单</text>
        </view>
      </view>
      <view class="hero-stats">
        <view class="stat">
          <text class="stat-label">月销</text>
          <text class="stat-val">{{ stats.orderTotal }}</text>
        </view>
        <view class="stat">
          <text class="stat-label">好评率</text>
          <text class="stat-val">{{ stats.goodReviewRate }}%</text>
        </view>
        <view class="stat">
          <text class="stat-label">客诉率</text>
          <text class="stat-val">{{ stats.complaintRate }}%</text>
        </view>
        <view class="stat">
          <text class="stat-label">发货时长</text>
          <text class="stat-val">{{ stats.avgShipHours }}h</text>
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
          <text class="section-title">进行中订单</text>
        </view>
        <text class="more" @click="go('/pages/order/list')">全部 →</text>
      </view>
      <view v-if="orders.length">
        <BuyerOrderCard v-for="o in orders" :key="o.id" :order="o" @refresh="refreshOrders" />
      </view>
      <EmptyState v-else title="暂无进行中订单" description="去求购大厅接单赚取收益" />
    </view>

    <!-- 可接求购 -->
    <view class="section">
      <view class="section-bar">
        <view class="title-group">
          <view class="sec-tag gold"><text>CLAIMABLE</text></view>
          <text class="section-title">可接求购</text>
        </view>
        <text class="more" @click="go('/pages/purchase/hall')">前往大厅 →</text>
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
        <text class="more">押金管理 →</text>
      </view>
      <view class="deposit-progress">
        <view class="progress-bar">
          <view class="progress-fill" :style="{ width: depositPct + '%' }"></view>
        </view>
        <text class="progress-label">已担保 {{ depositPct.toFixed(1) }}%</text>
      </view>
      <view class="deposit-total">
        <text class="dep-label">总押金</text>
        <view class="dep-amount">
          <text class="unit">U</text>
          <text class="num">{{ depositTotal }}</text>
        </view>
      </view>
    </view>

    <view class="footer-space" />
  </view>
</template>

<style lang="scss" scoped>
.dash-page {
  min-height: 100vh;
  background: #FAFAF7;
  padding-bottom: 60rpx;
}

/* Hero */
.hero {
  position: relative;
  background: linear-gradient(135deg, #0F1B36 0%, #1E1F3A 60%, #5B5CE7 100%);
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
  display: block;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.72);
  margin-top: 6rpx;
}
.strong { color: #FFFFFF; font-weight: 700; }
.hero-stats {
  position: relative;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16rpx;
}
.stat {
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
