<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { formatAmount } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';
import TxnRow from '@/components/wallet/txn-row.vue';
import TxnDetailPopup from '@/components/wallet/txn-detail-popup.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { fetchWalletLedger } from '@/service/api/wallet';

const userStore = useUserStore();
const walletStore = useWalletStore();
const recent = ref<Api.Wallet.Txn[]>([]);
const popupOpen = ref(false);
const drawerTxn = ref<Api.Wallet.Txn>();

import { getUsdtCnyRate } from '@shared/utils/currency';
const cnyRate = getUsdtCnyRate();
const cnyEquiv = computed(() =>
  formatAmount((Number(walletStore.totalAssets) * cnyRate).toFixed(2))
);

const BUCKET_ICON: Record<string, string> = {
  available: '💳',
  nonWithdrawable: '⏸',
  lockedFinance: '🔒',
  frozenOrder: '📦',
  frozenRisk: '⚠',
  depositAvailable: '🪙',
  depositGuaranteed: '🤝'
};

const totalAssetsNum = computed(() => Number(walletStore.totalAssets) || 0);
const bucketsWithPct = computed(() =>
  walletStore.bucketsArray.map(b => ({
    ...b,
    pct: totalAssetsNum.value > 0 ? (Number(b.value) / totalAssetsNum.value) * 100 : 0
  }))
);

async function loadAll() {
  await userStore.init();
  if (!userStore.currentUser) return;
  try {
    await walletStore.fetchWallet(userStore.currentUser.id);
    const r = await fetchWalletLedger({ size: 5 });
    recent.value = r.records;
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '钱包数据加载失败', icon: 'none' });
  }
}
onShow(loadAll);

function openTxn(t: Api.Wallet.Txn) {
  drawerTxn.value = t;
  popupOpen.value = true;
}

function goBack() {
  uni.navigateBack();
}

function bucketLabel(key: string): string {
  const m: Record<string, string> = {
    available: '可用余额',
    nonWithdrawable: '不可提现',
    lockedFinance: '小金库锁仓',
    frozenOrder: '订单冻结',
    frozenRisk: '风控冻结',
    depositAvailable: '可担保押金',
    depositGuaranteed: '已担保押金'
  };
  return m[key] || key;
}
</script>

<template>
  <view class="wallet-page">
    <!-- Hero (白底 BiyaPay 风) -->
    <view class="hero">
      <view class="nav">
        <view class="nav-btn" @click="goBack">
          <view class="chev" />
        </view>
        <text class="nav-title">我的钱包</text>
      </view>
      <text class="hero-eyebrow">TOTAL ASSETS · USDT</text>
      <view class="hero-total">
        <text class="unit">U</text>
        <text class="num">{{ formatAmount(walletStore.totalAssets) }}</text>
      </view>
      <text class="hero-sub">
        ≈ <text class="cny-num">¥{{ cnyEquiv }}</text>  · 1 USDT = ¥{{ cnyRate.toFixed(2) }}
      </text>
      <view class="hero-actions">
        <view class="action-btn primary" @click="go('/pages/wallet/deposit')">
          <text class="action-icon">↓</text>
          <text>链上充值</text>
        </view>
        <view class="action-btn" @click="go('/pages/wallet/withdraw')">
          <text class="action-icon">↑</text>
          <text>转出</text>
        </view>
        <view class="action-btn" @click="go('/pages/wallet/history')">
          <text class="action-icon">≡</text>
          <text>流水</text>
        </view>
      </view>
    </view>

    <!-- 资产桶（vertical list） -->
    <view class="section">
      <text class="sec-eyebrow">ASSET BUCKETS</text>
      <text class="sec-title">资产分布</text>
      <view class="bucket-list">
        <view
          v-for="b in bucketsWithPct"
          :key="b.key"
          class="bucket-row"
        >
          <view class="row-left">
            <view class="icon-wrap"><text class="ico">{{ BUCKET_ICON[b.key] || '•' }}</text></view>
            <view class="row-label">
              <text class="label-main">{{ bucketLabel(b.key) }}</text>
            </view>
          </view>
          <view class="row-right">
            <view class="row-amount">
              <text class="amt-unit">U</text>
              <text class="amt-num">{{ formatAmount(b.value, { decimals: 2 }) }}</text>
            </view>
            <text class="row-pct">{{ b.pct.toFixed(1) }}%</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 最近交易 -->
    <view class="section">
      <view class="section-bar">
        <view>
          <text class="sec-eyebrow">RECENT TRANSACTIONS</text>
          <text class="sec-title">最近交易</text>
        </view>
        <text class="more" @click="go('/pages/wallet/history')">查看全部 →</text>
      </view>
      <view v-if="recent.length">
        <TxnRow v-for="t in recent" :key="t.id" :txn="t" @detail="openTxn" />
      </view>
      <EmptyState v-else title="暂无交易" />
    </view>

    <TxnDetailPopup v-model:visible="popupOpen" :txn="drawerTxn" />
  </view>
</template>

<style lang="scss" scoped>
.wallet-page {
  min-height: 100vh;
  background: #FAFAF7;
  padding-bottom: 40rpx;
}

/* Hero */
.hero {
  background: #FFFFFF;
  border-bottom: 1rpx solid #EDECE6;
  padding: env(safe-area-inset-top) 32rpx 40rpx;
}
.nav {
  display: flex;
  align-items: center;
  padding: 16rpx 0;
  margin-bottom: 24rpx;
}
.nav-btn {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.chev {
  position: relative;
  left: 4rpx;
  width: 28rpx;
  height: 28rpx;
  border-left: 5rpx solid #0F111A;
  border-bottom: 5rpx solid #0F111A;
  box-sizing: border-box;
  transform: rotate(45deg);
}
.nav-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #0F111A;
  margin-left: 8rpx;
}
.hero-eyebrow {
  display: block;
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 3rpx;
  color: #6B7385;
  margin-bottom: 12rpx;
}
.hero-total {
  display: flex;
  align-items: baseline;
  gap: 8rpx;
  margin-bottom: 12rpx;
}
.hero-total .unit {
  font-family: ui-monospace, monospace;
  font-size: 36rpx;
  font-weight: 600;
  color: #6B7385;
}
.hero-total .num {
  font-family: ui-monospace, monospace;
  font-size: 88rpx;
  font-weight: 700;
  color: #0F111A;
  letter-spacing: -3rpx;
  line-height: 1;
}
.hero-sub {
  display: block;
  font-size: 24rpx;
  color: #6B7385;
}
.cny-num {
  font-family: ui-monospace, monospace;
  color: #1D2129;
  font-weight: 600;
}

.hero-actions {
  display: flex;
  gap: 12rpx;
  margin-top: 32rpx;
}
.action-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  padding: 20rpx 12rpx;
  background: #FAFAF7;
  border: 1rpx solid #EDECE6;
  border-radius: 20rpx;
  color: #0F111A;
  font-size: 22rpx;
  font-weight: 600;
}
.action-btn.primary {
  background: #0F111A;
  color: #FFFFFF;
  border-color: #0F111A;
}
.action-icon {
  font-size: 40rpx;
}

/* Section */
.section {
  background: #FFFFFF;
  margin: 20rpx 24rpx;
  border-radius: 24rpx;
  border: 1rpx solid #EDECE6;
  padding: 28rpx;
}
.section-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20rpx;
}
.sec-eyebrow {
  display: block;
  font-size: 18rpx;
  font-weight: 700;
  letter-spacing: 3rpx;
  color: #6B7385;
  margin-bottom: 4rpx;
}
.sec-title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #0F111A;
  letter-spacing: -0.5rpx;
  margin-bottom: 16rpx;
}
.more {
  font-size: 22rpx;
  color: #6B7385;
}

/* Bucket rows */
.bucket-list {
  border-top: 1rpx solid #EDECE6;
}
.bucket-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx 0;
  border-bottom: 1rpx solid #EDECE6;
}
.bucket-row:last-child { border-bottom: none; }
.row-left {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-width: 0;
}
.icon-wrap {
  width: 56rpx;
  height: 56rpx;
  border-radius: 16rpx;
  background: #FAFAF7;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ico {
  font-size: 28rpx;
}
.label-main {
  font-size: 26rpx;
  font-weight: 600;
  color: #0F111A;
}
.row-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4rpx;
}
.row-amount {
  display: flex;
  align-items: baseline;
  gap: 4rpx;
  color: #0F111A;
}
.amt-unit {
  font-family: ui-monospace, monospace;
  font-size: 20rpx;
  font-weight: 600;
  color: #6B7385;
}
.amt-num {
  font-family: ui-monospace, monospace;
  font-size: 30rpx;
  font-weight: 700;
  letter-spacing: -0.5rpx;
}
.row-pct {
  font-family: ui-monospace, monospace;
  font-size: 20rpx;
  color: #A8ADB8;
}
</style>
