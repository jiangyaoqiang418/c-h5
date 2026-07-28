<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import { MOCK_USERS, formatAmount, formatPoints, orderApi, vipApi, walletApi } from '@shared';
import { go } from '@/utils/navigate';
import AudienceSegment from '@/components/common/audience-segment.vue';
import VipBadge from '@/components/common/vip-badge.vue';
import KycStatusTag from '@/components/common/kyc-status-tag.vue';
import CustomTabBar from '@/components/layout/custom-tab-bar.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();

const totalAssets = ref<string>('0');
const orderCounts = ref<Record<string, number>>({});
const vipStatus = ref<Awaited<ReturnType<typeof vipApi.fetchMyVipStatus>>>();
const unreadCount = ref(6);

const user = computed(() => userStore.currentUser);

async function loadAll() {
  if (!user.value) return;
  const uid = user.value.id;
  const [assets, counts, vip] = await Promise.all([
    walletApi.fetchTotalAssetsOfUser(uid),
    orderApi.countMyOrdersByStatus(uid),
    vipApi.fetchMyVipStatus(uid)
  ]);
  totalAssets.value = assets.total;
  orderCounts.value = counts;
  vipStatus.value = vip;
}
onMounted(loadAll);

const orderTabs = computed(() => [
  { label: '待付款', count: orderCounts.value['PENDING_PAYMENT'] || 0 },
  { label: '待发货', count: (orderCounts.value['PROCURING'] || 0) + (orderCounts.value['PROCURED'] || 0) },
  { label: '待收货', count: (orderCounts.value['IN_TRANSIT'] || 0) + (orderCounts.value['AFTERSALE_CONFIRM'] || 0) },
  { label: '已完成', count: (orderCounts.value['COMPLETED'] || 0) + (orderCounts.value['WARRANTY'] || 0) },
  { label: '售后', count: orderCounts.value['IN_AFTERSALE'] || 0 }
]);

const cells = computed(() => {
  const buyerActive = userStore.isBuyerActive;
  if (buyerActive) {
    return [
      { label: '买手仪表盘', icon: 'lucide:layout-dashboard', go: () => go('/pages/buyer/dashboard') },
      { label: '商品管理', icon: 'lucide:package', go: () => go('/pages/buyer/products') },
      { label: '买手押金', icon: 'lucide:lock', go: () => go('/pages/buyer/deposit') },
      { label: '我的钱包', icon: 'lucide:wallet', go: () => go('/pages/wallet/index') },
      { label: '小金库', icon: 'lucide:piggy-bank', go: () => go('/pages/finance/list') },
      { label: '我的评价', icon: 'lucide:star', go: () => go('/pages/review/list') },
      { label: 'VIP 特权', icon: 'lucide:crown', go: () => go('/pages/vip/index') },
      { label: 'KYC 认证', icon: 'lucide:badge-check', go: () => go('/pages/kyc/index') }
    ];
  }
  return [
    { label: '我的钱包', icon: 'lucide:wallet', go: () => go('/pages/wallet/index') },
    { label: '小金库', icon: 'lucide:piggy-bank', go: () => go('/pages/finance/list') },
    { label: '我的求购', icon: 'lucide:search', go: () => go('/pages/purchase/my-list') },
    { label: '我的售后', icon: 'lucide:wrench', go: () => go('/pages/aftersale/list') },
    { label: '我的评价', icon: 'lucide:star', go: () => go('/pages/review/list') },
    { label: '我的积分', icon: 'lucide:coins', go: () => go('/pages/my/points') },
    { label: '地址管理', icon: 'lucide:map-pin', go: () => go('/pages/my/addresses') },
    { label: 'KYC 认证', icon: 'lucide:badge-check', go: () => go('/pages/kyc/index') },
    { label: 'VIP 特权', icon: 'lucide:crown', go: () => go('/pages/vip/index') },
    { label: '帮助中心', icon: 'lucide:help-circle', go: () => go('/pages/help/index') }
  ];
});

function switchDemoUser() {
  uni.showActionSheet({
    itemList: MOCK_USERS.map(u => `${u.label} · ${u.desc}`),
    success: r => {
      const u = MOCK_USERS[r.tapIndex];
      userStore.switchDemoUser(u.userId);
    }
  });
}

function logout() {
  uni.showModal({
    title: '退出登录？',
    success: r => {
      if (r.confirm) {
        userStore.logout();
        uni.showToast({ title: '已退出', icon: 'success' });
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
  <view class="my-page">
    <!-- 用户卡 -->
    <view class="user-card">
      <view class="bell-btn" @click="goMessages">
        <Icon icon="lucide:bell" width="20" />
        <view v-if="unreadCount > 0" class="bell-dot">{{ unreadCount > 99 ? '99+' : unreadCount }}</view>
      </view>

      <view v-if="user" class="user-row">
        <view class="avatar">{{ user.nickname.slice(0, 1) }}</view>
        <view class="info">
          <view class="name-row">
            <text class="name">{{ user.nickname }}</text>
            <VipBadge :level="user.vipLevel" />
          </view>
          <view class="tag-row">
            <KycStatusTag :status="user.kycStatus" />
            <text class="email">{{ user.email }}</text>
          </view>
        </view>
        <text class="switch-btn" @click="switchDemoUser">切换</text>
      </view>
      <view v-else class="user-row">
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
        <view v-if="vipStatus?.nextThreshold" class="stat">
          <text class="stat-val">{{ formatPoints(vipStatus.pointsToNext) }}</text>
          <text class="stat-lbl">距升级</text>
        </view>
      </view>
    </view>

    <!-- AI 导购 CTA 横条 -->
    <view v-if="user" class="ai-cta" @click="goAiChat">
      <view class="ai-left">
        <view class="ai-icon-wrap">
          <Icon icon="lucide:sparkles" width="20" />
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
        <text class="section-title">{{ userStore.isBuyerActive ? '买手中心' : '功能中心' }}</text>
      </view>
      <view class="cell-grid">
        <view v-for="c in cells" :key="c.label" class="cell" @click="c.go()">
          <view class="cell-icon-wrap">
            <Icon :icon="c.icon" width="24" />
          </view>
          <text class="cell-label">{{ c.label }}</text>
        </view>
      </view>
    </view>

    <!-- 退出 -->
    <view v-if="user" class="logout-btn" @click="logout">
      <text>退出登录</text>
    </view>
    <view class="footer-space" />
    <CustomTabBar current="my" />
  </view>
</template>

<style lang="scss" scoped>
.my-page {
  min-height: 100vh;
  background: #FAFAF7;
  padding-bottom: 160rpx;
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
}
.name {
  font-size: 32rpx;
  font-weight: 700;
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
}
.switch-btn {
  font-size: 22rpx;
  background: rgba(255, 255, 255, 0.2);
  padding: 6rpx 12rpx;
  border-radius: 6rpx;
}
.segment-row {
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
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8rpx;
}
.ot-cell {
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
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12rpx;
}
.cell {
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
.footer-space {
  height: 32rpx;
}
</style>
