<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { formatAmount } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';
import TxnRow from '@/components/wallet/txn-row.vue';
import TxnDetailPopup from '@/components/wallet/txn-detail-popup.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { fetchWalletLedger, type WalletTxnView } from '@/service/api/wallet';
import { UI_ASSETS } from '@/constants/ui-assets';

const userStore = useUserStore();
const walletStore = useWalletStore();
const recent = ref<WalletTxnView[]>([]);
const loading = ref(false);
const walletLoadFailed = ref(false);
const recentLoadFailed = ref(false);
const popupOpen = ref(false);
const drawerTxn = ref<WalletTxnView>();

import { getUsdtCnyRate } from '@shared/utils/currency';
const cnyRate = getUsdtCnyRate();
const cnyEquiv = computed(() =>
  formatAmount((Number(walletStore.totalAssets) * cnyRate).toFixed(2))
);

const BUCKET_ICON: Record<string, string> = {
  available: 'wallet',
  nonWithdrawable: 'clock',
  lockedFinance: 'lock-on',
  frozenOrder: 'cart',
  frozenRisk: 'shield',
  depositAvailable: 'money-circle',
  depositGuaranteed: 'shield'
};

const totalAssetsNum = computed(() => Number(walletStore.totalAssets) || 0);
const bucketsWithPct = computed(() =>
  walletStore.bucketsArray.map(b => ({
    ...b,
    pct: totalAssetsNum.value > 0 ? (Number(b.value) / totalAssetsNum.value) * 100 : 0
  }))
);

async function loadAll() {
  loading.value = true;
  walletLoadFailed.value = false;
  recentLoadFailed.value = false;
  try {
    await userStore.init();
    if (!userStore.currentUser) {
      walletStore.clear();
      recent.value = [];
      return;
    }
    const [walletResult, ledgerResult] = await Promise.allSettled([
      walletStore.fetchWallet(userStore.currentUser.id),
      fetchWalletLedger({ size: 5 })
    ]);
    if (walletResult.status === 'rejected' && !walletStore.account) walletLoadFailed.value = true;
    if (ledgerResult.status === 'fulfilled') recent.value = ledgerResult.value.records;
    else if (!recent.value.length) recentLoadFailed.value = true;
    if (walletResult.status === 'rejected' || ledgerResult.status === 'rejected') {
      uni.showToast({ title: '钱包数据部分加载失败', icon: 'none' });
    }
  } catch (error) {
    if (!walletStore.account) walletLoadFailed.value = true;
    if (!recent.value.length) recentLoadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '钱包数据加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}
onShow(loadAll);

function openTxn(t: WalletTxnView) {
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
    <view v-if="loading && !walletStore.account" class="page-loading">钱包数据加载中…</view>
    <EmptyState v-else-if="walletLoadFailed && !walletStore.account" title="钱包数据加载失败" description="请稍后重试" />
    <template v-else>
    <!-- Hero (白底 BiyaPay 风) -->
    <view class="hero" :style="{ backgroundImage: `url(${UI_ASSETS.backgrounds.chain})` }">
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
          <wd-icon name="arrow-down" size="21px" />
          <text>链上充值</text>
        </view>
        <view class="action-btn" @click="go('/pages/wallet/withdraw')">
          <wd-icon name="arrow-up" size="21px" />
          <text>转出</text>
        </view>
        <view class="action-btn" @click="go('/pages/wallet/history')">
          <wd-icon name="list" size="21px" />
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
            <view class="icon-wrap"><wd-icon :name="BUCKET_ICON[b.key] || 'wallet'" size="18px" /></view>
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

    <view class="section">
      <text class="sec-eyebrow">FUND ORDERS</text>
      <text class="sec-title">充提记录</text>
      <view class="record-links">
        <view class="record-link" @click="go('/pages/wallet/recharge-list')">
          <view><text class="record-title">充值记录</text><text class="record-sub">查看充值地址与到账状态</text></view>
          <wd-icon name="arrow-right" size="16px" color="#a6a9b1" />
        </view>
        <view class="record-link" @click="go('/pages/wallet/withdraw-list')">
          <view><text class="record-title">提现记录</text><text class="record-sub">查看审核与链上到账状态</text></view>
          <wd-icon name="arrow-right" size="16px" color="#a6a9b1" />
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
        <view class="more" @click="go('/pages/wallet/history')">查看全部 <wd-icon name="arrow-right" size="12px" /></view>
      </view>
      <view v-if="recent.length">
        <TxnRow v-for="t in recent" :key="t.id" :txn="t" @detail="openTxn" />
      </view>
      <EmptyState v-else-if="recentLoadFailed" title="最近交易加载失败" description="请稍后重试" />
      <EmptyState v-else title="暂无交易" />
    </view>

    <TxnDetailPopup v-model:visible="popupOpen" :txn="drawerTxn" />
    </template>
  </view>
</template>

<style lang="scss" scoped>
.wallet-page {
  min-height: 100%;
  background: #FAFAF7;
  padding-bottom: 40rpx;
}
.page-loading { padding: 120rpx 0; text-align: center; color: #86909c; font-size: 24rpx; }

/* Hero */
.hero {
  background-color: #10131f;
  background-size: cover;
  background-position: center;
  color: #fff;
  border-bottom: 1rpx solid rgba(255,255,255,.12);
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
  border-left: 5rpx solid #fff;
  border-bottom: 5rpx solid #fff;
  box-sizing: border-box;
  transform: rotate(45deg);
}
.nav-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #fff;
  margin-left: 8rpx;
}
.hero-eyebrow {
  display: block;
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 3rpx;
  color: rgba(255,255,255,.64);
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
  color: rgba(255,255,255,.76);
}
.hero-total .num {
  font-family: ui-monospace, monospace;
  font-size: 88rpx;
  font-weight: 700;
  color: #fff;
  letter-spacing: -3rpx;
  line-height: 1;
}
.hero-sub {
  display: block;
  font-size: 24rpx;
  color: rgba(255,255,255,.76);
}
.cny-num {
  font-family: ui-monospace, monospace;
  color: #fff;
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
  background: rgba(255,255,255,.1);
  border: 1rpx solid rgba(255,255,255,.16);
  border-radius: 20rpx;
  color: #fff;
  font-size: 22rpx;
  font-weight: 600;
}
.action-btn.primary {
  background: var(--yb-brand);
  color: #FFFFFF;
  border-color: #0F111A;
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
  display: flex;
  align-items: center;
  gap: 4rpx;
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
.record-links { border-top: 1rpx solid #edece6; }
.record-link { display: flex; align-items: center; justify-content: space-between; padding: 24rpx 0; border-bottom: 1rpx solid #edece6; }
.record-link:last-child { border-bottom: none; }
.record-title { display: block; font-size: 26rpx; font-weight: 600; color: #0f111a; }
.record-sub { display: block; margin-top: 6rpx; font-size: 22rpx; color: #86909c; }
.record-arrow { font-size: 40rpx; color: #c9cdd4; }
</style>
