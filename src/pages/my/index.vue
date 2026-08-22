<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { formatAmount, formatPoints } from '@shared';
import { go } from '@/utils/navigate';
import AudienceSegment from '@/components/common/audience-segment.vue';
import VipBadge from '@/components/common/vip-badge.vue';
import KycStatusTag from '@/components/common/kyc-status-tag.vue';
import { fetchPointAccount, type PointAccount } from '@/service/api/point';
import { countBoughtOrdersByStatus, countSoldOrdersByStatus } from '@/service/api/order';
import { fetchImUnreadCount, fetchNotificationUnreadCount } from '@/service/api/notify';
import { useUserStore, useWalletStore } from '@/stores';

const userStore = useUserStore();
const walletStore = useWalletStore();

const orderCounts = ref<Record<string, number>>({});
const pointAccount = ref<PointAccount>();
const unreadCount = ref(0);

const user = computed(() => userStore.currentUser);
const totalAssets = computed(() => walletStore.totalAssets);
const activeVip = computed(() => (
  userStore.isBuyerActive ? pointAccount.value?.buyer : pointAccount.value?.customer
));
const pointsToNext = computed(() => {
  const nextThreshold = Number(activeVip.value?.nextThreshold);
  const points = Number(pointAccount.value?.points ?? user.value?.points ?? 0);
  if (!Number.isFinite(nextThreshold) || nextThreshold <= points) return undefined;
  return nextThreshold - points;
});

async function loadAll() {
  await userStore.init();
  if (!user.value) return;
  try {
    const [, counts, account] = await Promise.all([
      walletStore.fetchWallet(),
      userStore.isBuyerActive ? countSoldOrdersByStatus() : countBoughtOrdersByStatus(),
      fetchPointAccount()
    ]);
    orderCounts.value = counts;
    pointAccount.value = account;
    try {
      const [notificationCount, imCount] = await Promise.all([
        fetchNotificationUnreadCount(),
        fetchImUnreadCount()
      ]);
      unreadCount.value = notificationCount + imCount;
    } catch {
      unreadCount.value = 0;
    }
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '账户数据加载失败', icon: 'none' });
  }
}
onShow(loadAll);

const orderTabs = computed(() => [
  { label: '待付款', count: orderCounts.value.CREATED || 0 },
  { label: '待发货', count: orderCounts.value.PAID || 0 },
  { label: '待收货', count: orderCounts.value.SHIPPED || 0 },
  { label: '已完成', count: orderCounts.value.COMPLETED || 0 },
  { label: '售后', count: (orderCounts.value.REFUND_REVIEW || 0) + (orderCounts.value.REFUNDED || 0) }
]);

const cells = computed(() => {
  if (!user.value) {
    return [
      { label: '帮助中心', icon: '?', go: () => go('/pages/help/index') }
    ];
  }
  const buyerActive = userStore.isBuyerActive;
  if (buyerActive) {
    return [
      { label: '买手仪表盘', icon: '▦', go: () => go('/pages/buyer/dashboard') },
      { label: '商品管理', icon: '□', go: () => go('/pages/buyer/products') },
      { label: '我的收藏', icon: '☆', go: () => go('/pages/my/favorites') },
      { label: '买手押金', icon: '▣', go: () => go('/pages/buyer/deposit') },
      { label: '我的钱包', icon: '◈', go: () => go('/pages/wallet/index') },
      { label: '小金库', icon: '◒', go: () => go('/pages/finance/list') },
      { label: '我的评价', icon: '★', go: () => go('/pages/review/list') },
      { label: 'VIP 特权', icon: '♛', go: () => go('/pages/vip/index') },
      { label: 'KYC 认证', icon: '✓', go: () => go('/pages/kyc/index') }
    ];
  }
  return [
    { label: '我的钱包', icon: '◈', go: () => go('/pages/wallet/index') },
    { label: '我的收藏', icon: '☆', go: () => go('/pages/my/favorites') },
    { label: '小金库', icon: '◒', go: () => go('/pages/finance/list') },
    { label: '我的求购', icon: '⌕', go: () => go('/pages/purchase/my-list') },
    { label: '买手申请', icon: '▤', go: () => go('/pages/buyer/apply') },
    { label: '我的售后', icon: '◇', go: () => go('/pages/aftersale/list') },
    { label: '我的评价', icon: '★', go: () => go('/pages/review/list') },
    { label: '我的积分', icon: '◎', go: () => go('/pages/my/points') },
    { label: '地址管理', icon: '⌖', go: () => go('/pages/my/addresses') },
    { label: 'KYC 认证', icon: '✓', go: () => go('/pages/kyc/index') },
    { label: 'VIP 特权', icon: '♛', go: () => go('/pages/vip/index') },
    { label: '帮助中心', icon: '?', go: () => go('/pages/help/index') }
  ];
});

function logout() {
  uni.showModal({
    title: '退出登录？',
    success: r => {
      if (r.confirm) {
        userStore.logout();
        walletStore.clear();
        uni.reLaunch({ url: '/pages/auth/login' });
      }
    }
  });
}

function goLogin() {
  go('/pages/auth/login');
}

function goMessages() {
  go('/pages/message/index');
}

function goAiChat() {
  go('/pages/ai/index');
}
</script>

<template>
  <view class="my-page h5-tab-page">
    <!-- 用户卡 -->
    <view class="user-card">
      <view v-if="user" class="bell-btn" @click="goMessages">
        <text class="local-icon">♢</text>
        <view v-if="unreadCount > 0" class="bell-dot">{{ unreadCount > 99 ? '99+' : unreadCount }}</view>
      </view>

      <view v-if="user" class="user-row">
        <view class="avatar">{{ user.nickname.slice(0, 1) }}</view>
        <view class="info">
          <view class="name-row">
            <text class="name">{{ user.nickname }}</text>
            <VipBadge :level="user.vipLevel" />
            <KycStatusTag :status="user.kycStatus" light />
          </view>
          <view class="tag-row">
            <text class="email">{{ user.email }}</text>
          </view>
        </view>
      </view>
      <view v-else class="user-row guest">
        <view class="avatar">?</view>
        <view class="info">
          <text class="name">未登录</text>
          <text class="email">登录后享受全部功能</text>
        </view>
        <wd-button type="primary" size="small" @click="goLogin">登录</wd-button>
      </view>

      <view v-if="user" class="segment-row">
        <AudienceSegment />
      </view>

      <view v-if="user" class="stats-row">
        <view class="stat">
          <text class="stat-val">U {{ formatAmount(totalAssets) }}</text>
          <text class="stat-lbl">总资产</text>
        </view>
        <view class="stat">
          <text class="stat-val">{{ formatPoints(user.points) }}</text>
          <text class="stat-lbl">积分</text>
        </view>
        <view v-if="pointsToNext !== undefined" class="stat">
          <text class="stat-val">{{ formatPoints(pointsToNext) }}</text>
          <text class="stat-lbl">距升级</text>
        </view>
      </view>
    </view>

    <!-- AI 导购 CTA 横条 -->
    <view v-if="user" class="ai-cta" @click="goAiChat">
      <view class="ai-left">
        <view class="ai-icon-wrap">
          <text class="local-icon">✦</text>
        </view>
        <view class="ai-copy">
          <text class="ai-title">AI 智能导购</text>
          <text class="ai-sub">告诉我你要什么 · 全球买手 24h 应答</text>
        </view>
      </view>
      <text class="ai-arrow">›</text>
    </view>

    <!-- 订单概况 -->
    <view v-if="user" class="section">
      <view class="section-head">
        <text class="section-title">订单概况</text>
        <text class="more" @click="go('/pages/order/list')">查看全部 ›</text>
      </view>
      <view class="order-tabs">
        <view
          v-for="t in orderTabs"
          :key="t.label"
          class="ot-cell"
          @click="go('/pages/order/list')"
        >
          <text class="ot-num">{{ t.count }}</text>
          <text class="ot-lbl">{{ t.label }}</text>
        </view>
      </view>
    </view>

    <!-- 快捷入口 -->
    <view class="section">
      <view class="section-head">
        <text class="section-title">{{ !user ? '服务中心' : userStore.isBuyerActive ? '买手中心' : '功能中心' }}</text>
      </view>
      <view class="cell-grid" :class="{ guest: !user }">
        <view v-for="c in cells" :key="c.label" class="cell" @click="c.go()">
          <view class="cell-icon-wrap">
            <text class="local-icon">{{ c.icon }}</text>
          </view>
          <text class="cell-label">{{ c.label }}</text>
        </view>
      </view>
    </view>

    <!-- 退出 -->
    <view v-if="user" class="logout-btn" @click="logout">
      <text>退出登录</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.local-icon { font-size: 32rpx; line-height: 1; }
.my-page {
  min-height: 100%;
  background: #FAFAF7;
}
.user-card {
  background: linear-gradient(135deg, #4d80f0 0%, #722ed1 100%);
  color: #fff;
  padding: 32rpx;
  position: relative;
}
.bell-btn {
  position: absolute;
  top: 32rpx;
  right: 32rpx;
  width: 64rpx;
  height: 64rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.bell-dot {
  position: absolute;
  top: -4rpx;
  right: -4rpx;
  min-width: 32rpx;
  height: 32rpx;
  border-radius: 16rpx;
  background: #F53F3F;
  color: #fff;
  font-size: 18rpx;
  font-weight: 700;
  padding: 0 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.user-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding-right: 80rpx;
}
.user-row.guest {
  padding-right: 0;
}
.user-row.guest .info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8rpx;
}
.user-row.guest .email {
  display: block;
}
.avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  font-weight: 700;
}
.info {
  flex: 1;
  min-width: 0;
}
.name-row {
  display: flex;
  gap: 8rpx;
  align-items: center;
  flex-wrap: nowrap;
}
.name {
  font-size: 32rpx;
  font-weight: 700;
  white-space: nowrap;
}
.tag-row {
  display: flex;
  gap: 8rpx;
  align-items: center;
  margin-top: 6rpx;
}
.email {
  font-size: 22rpx;
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.segment-row {
  display: flex;
  justify-content: center;
  margin-top: 24rpx;
}
.stats-row {
  display: flex;
  margin-top: 24rpx;
  gap: 16rpx;
}
.stat {
  flex: 1;
}
.stat-val {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  font-family: ui-monospace, monospace;
}
.stat-lbl {
  display: block;
  font-size: 20rpx;
  opacity: 0.78;
  margin-top: 2rpx;
}

/* AI CTA */
.ai-cta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20rpx;
  background: linear-gradient(135deg, #6B4EFF 0%, #4D80F0 100%);
  color: #fff;
  border-radius: 20rpx;
  margin: 20rpx 20rpx 0;
  padding: 28rpx 32rpx;
}
.ai-left {
  display: flex;
  align-items: center;
  gap: 20rpx;
  min-width: 0;
}
.ai-icon-wrap {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.20);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}
.ai-copy {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.ai-title {
  font-size: 30rpx;
  font-weight: 700;
  letter-spacing: -0.5rpx;
}
.ai-sub {
  font-size: 22rpx;
  opacity: 0.85;
}
.ai-arrow {
  font-size: 40rpx;
  color: rgba(255, 255, 255, 0.75);
  line-height: 1;
}

/* Sections */
.section {
  background: #fff;
  margin: 20rpx 20rpx 0;
  border-radius: 20rpx;
  border: 1rpx solid #EDECE6;
  padding: 20rpx;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8rpx 12rpx 16rpx;
}
.section-title {
  font-size: 28rpx;
  font-weight: 700;
  color: #0F111A;
  letter-spacing: -0.5rpx;
}
.more {
  font-size: 22rpx;
  color: #86909c;
}
.order-tabs {
  display: flex;
  gap: 8rpx;
}
.ot-cell {
  flex: 1;
  min-width: 0;
  text-align: center;
  padding: 16rpx 0;
}
.ot-num {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: #0F111A;
  font-family: ui-monospace, monospace;
}
.ot-lbl {
  display: block;
  font-size: 22rpx;
  color: #86909c;
  margin-top: 4rpx;
}
.cell-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.cell-grid.guest {
  display: flex;
  justify-content: center;
}
.cell-grid.guest .cell {
  width: 25%;
  box-sizing: border-box;
}
.cell {
  width: calc((100% - 36rpx) / 4);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20rpx 8rpx;
  gap: 12rpx;
}
.cell-icon-wrap {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: #FAFAF7;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #0F111A;
}
.cell-label {
  font-size: 22rpx;
  color: #4e5969;
  text-align: center;
}
.logout-btn {
  margin: 24rpx 20rpx;
  background: #fff;
  border-radius: 20rpx;
  border: 1rpx solid #EDECE6;
  padding: 28rpx;
  text-align: center;
  color: #f53f3f;
  font-size: 28rpx;
}
</style>
