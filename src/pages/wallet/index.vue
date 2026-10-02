<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { formatAmount } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';
import TxnRow from '@/components/wallet/txn-row.vue';
import TxnDetailPopup from '@/components/wallet/txn-detail-popup.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { fetchWalletLedger, type WalletTxnView } from '@/service/api/wallet';
import { getAccessToken } from '@/service/request/token';
import { useNavigationGuards } from '@/utils/navigate';

const userStore = useUserStore();
const walletStore = useWalletStore();
const recent = ref<WalletTxnView[]>([]);
const loading = ref(false);
const walletLoadFailed = ref(false);
const recentLoadFailed = ref(false);
const profileFailed = ref(false);
const popupOpen = ref(false);
const expandedBuckets = ref(false);
const drawerTxn = ref<WalletTxnView>();
const { requireLogin } = useNavigationGuards();
let loadSequence = 0;
watch(() => userStore.realUserId, () => {
  loadSequence++;
  recent.value = [];
  drawerTxn.value = undefined;
  popupOpen.value = false;
  loading.value = false;
  walletLoadFailed.value = false;
  recentLoadFailed.value = false;
  profileFailed.value = false;
}, { flush: 'sync' });

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
  await userStore.init();
  const sequence = ++loadSequence;
  loading.value = true;
  walletLoadFailed.value = false;
  recentLoadFailed.value = false;
  profileFailed.value = false;
  try {
    if (!userStore.currentUser) {
      walletStore.clear();
      recent.value = [];
      profileFailed.value = !!getAccessToken();
      return;
    }
    const [walletResult, ledgerResult] = await Promise.allSettled([
      walletStore.fetchWallet(userStore.currentUser.id),
      fetchWalletLedger({ size: 5 })
    ]);
    if (sequence !== loadSequence) return;
    if (walletResult.status === 'rejected' && !walletStore.account) walletLoadFailed.value = true;
    if (ledgerResult.status === 'fulfilled') recent.value = ledgerResult.value.records;
    else if (!recent.value.length) recentLoadFailed.value = true;
    if (walletResult.status === 'rejected' || ledgerResult.status === 'rejected') {
      uni.showToast({ title: '钱包数据部分加载失败', icon: 'none' });
    }
  } catch (error) {
    if (sequence !== loadSequence) return;
    if (!walletStore.account) walletLoadFailed.value = true;
    if (!recent.value.length) recentLoadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '钱包数据加载失败', icon: 'none' });
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}
onShow(loadAll);

function openTxn(t: WalletTxnView) {
  drawerTxn.value = t;
  popupOpen.value = true;
}

function goBack() {
  if (getCurrentPages().length > 1) {
    uni.navigateBack();
    return;
  }
  go('/pages/my/index', true);
}

async function login() { await requireLogin('/pages/wallet/index'); }

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
    <EmptyState v-else-if="profileFailed" title="账户资料加载失败" description="请联网后重试" action-text="重新加载" @action="loadAll" />
    <EmptyState v-else-if="!userStore.currentUser" title="请先登录查看钱包" description="登录后可查看资产与资金流水" action-text="登录" @action="login" />
    <template v-else>
    <!-- Hero (白底 BiyaPay 风) -->
    <view class="hero">
      <view class="nav">
        <view class="nav-btn" @click="goBack">
          <view class="chev" />
        </view>
        <text class="nav-title">我的钱包</text>
      </view>
      <text class="hero-eyebrow">总资产</text>
      <view class="hero-total">
        <text class="num" :class="{ 'num-long': formatAmount(walletStore.totalAssets).length > 12 }">{{ formatAmount(walletStore.totalAssets) }}</text>
        <text class="unit">USDT</text>
      </view>
      <text class="hero-sub">
        参考 ≈ <text class="cny-num">¥{{ cnyEquiv }}</text>  · 参考汇率 1 USDT = ¥{{ cnyRate.toFixed(2) }}
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

      <text class="sec-title">资产分布</text>
      <view class="bucket-list">
        <view
          v-for="b in (expandedBuckets ? bucketsWithPct : bucketsWithPct.filter(item => item.key === 'available'))"
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
              <text class="amt-num">{{ formatAmount(b.value) }}</text>
              <text class="amt-unit">USDT</text>
            </view>
            <text class="row-pct">{{ b.pct.toFixed(1) }}%</text>
          </view>
        </view>
      </view>
      <view class="bucket-toggle" @click="expandedBuckets = !expandedBuckets">{{ expandedBuckets ? '收起资产明细' : '展开全部资产明细' }} <wd-icon :name="expandedBuckets ? 'arrow-up' : 'arrow-down'" size="14px" /></view>
    </view>

    <view class="section">

      <view class="record-links">
        <view class="record-link" @click="go('/pages/wallet/recharge-list')">
          <view><text class="record-title">充值记录</text></view>
          <wd-icon name="arrow-right" size="16px" color="#a6a9b1" />
        </view>
        <view class="record-link" @click="go('/pages/wallet/withdraw-list')">
          <view><text class="record-title">提现记录</text></view>
          <wd-icon name="arrow-right" size="16px" color="#a6a9b1" />
        </view>
      </view>
    </view>

    <!-- 最近交易 -->
    <view class="section recent-section">
      <view class="section-bar">
        <view>

          <text class="sec-title">最近交易</text>
        </view>
        <view class="more" @click="go('/pages/wallet/history')">查看全部 <wd-icon name="arrow-right" size="12px" /></view>
      </view>
      <view v-if="recent.length">
        <TxnRow v-for="t in recent" :key="t.id" :txn="t" @detail="openTxn" />
      </view>
      <view v-else-if="loading" class="page-loading">正在读取最近交易…</view>
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
  background: var(--yb-bg);
  padding-bottom: calc(40rpx + env(safe-area-inset-bottom));
}
.page-loading { padding: 120rpx 0; text-align: center; color: var(--yb-muted); font-size: 24rpx; }

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
  width: 88rpx;
  height: 88rpx;
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
  font-size: 24rpx;
  font-weight: 700;
  letter-spacing: 0;
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
  flex-shrink: 0;
  font-family: var(--yb-font-body);
  font-size: 26rpx;
  font-weight: 600;
  color: rgba(255,255,255,.76);
}
.hero-total .num {
  flex: 0 1 auto;
  min-width: 0;
  word-break: break-all;
  font-family: var(--yb-font-body);
  font-size: 64rpx;
  font-weight: 700;
  color: #fff;
  letter-spacing: -1rpx;
  line-height: 1.15;
}
.hero-total .num-long {
  font-size: 48rpx;
}
.hero-sub {
  display: block;
  font-size: 24rpx;
  color: rgba(255,255,255,.76);
}
.cny-num {
  font-family: var(--yb-font-body);
  color: #fff;
  font-weight: 600;
}

.hero-actions {
  display: flex;
  gap: 12rpx;
  margin-top: 24rpx;
}
.action-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6rpx;
  padding: 16rpx 12rpx;
  background: rgba(255,255,255,.1);
  border: 1rpx solid rgba(255,255,255,.16);
  border-radius: 20rpx;
  color: #fff;
  font-size: 24rpx;
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
  border: 1rpx solid var(--yb-border);
  padding: 24rpx;
}
.section-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 8rpx;
}
.sec-eyebrow {
  display: block;
  font-size: 18rpx;
  font-weight: 700;
  letter-spacing: 0;
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
  min-height: 88rpx;
  flex-shrink: 0;
  font-size: 24rpx;
  color: var(--yb-muted);
}
.section-bar .sec-title { margin-bottom: 0; }
.recent-section :deep(.txn-row) { padding-right: 0; padding-left: 0; }

/* Bucket rows */
.bucket-list {
  border-top: 1rpx solid var(--yb-border);
}
.bucket-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx 0;
  border-bottom: 1rpx solid var(--yb-border);
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
  background: var(--yb-bg);
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
  min-width: 0;
  max-width: 60%;
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
  font-family: var(--yb-font-body);
  font-size: 24rpx;
  font-weight: 600;
  color: #6B7385;
}
.amt-num {
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: var(--yb-font-body);
  font-size: 30rpx;
  font-weight: 700;
  letter-spacing: -0.5rpx;
}
.row-pct {
  font-family: var(--yb-font-body);
  font-size: 24rpx;
  color: var(--yb-muted);
}
.record-links { display:flex; gap:20rpx; }
.record-link { display: flex; align-items: center; justify-content: space-between; flex:1; min-width:0; gap:8rpx; padding:8rpx 0; min-height:44px; }
.record-link:last-child { border-bottom: none; }
.record-title { display: block; font-size: 26rpx; font-weight: 600; color: #0f111a; }
.record-sub { display: block; margin-top: 6rpx; font-size: 24rpx; color: var(--yb-muted); }
.record-arrow { font-size: 40rpx; color: #c9cdd4; }
.bucket-toggle { display: flex; align-items: center; justify-content: center; min-height: 88rpx; color: var(--yb-muted); font-size: 26rpx; gap: 12rpx; }
</style>
