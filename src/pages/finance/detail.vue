<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { financeApi, vipApi } from '@shared';
import { calcInterest } from '@shared/mock/data/finance-lockup-orders';
import { formatAmount, formatRate } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';

const userStore = useUserStore();
const walletStore = useWalletStore();
const product = ref<Api.FinanceProduct.ProductRecord>();
const vipStatus = ref<Awaited<ReturnType<typeof vipApi.fetchMyVipStatus>>>();
const amount = ref(100);
const submitting = ref(false);

onLoad(async query => {
  const id = Number(query?.id);
  if (!id) return;
  product.value = await financeApi.fetchFinanceProductDetail(id);
  if (userStore.currentUser) {
    vipStatus.value = await vipApi.fetchMyVipStatus(userStore.currentUser.id);
    await walletStore.fetchWallet(userStore.currentUser.id);
    if (product.value) amount.value = Number(product.value.minAmount) || 100;
  }
});

const vipBonus = computed(() => {
  const cfg = vipStatus.value?.config;
  if (!cfg || vipStatus.value?.audience !== 'customer') return 0;
  return Number(cfg.customerBenefits?.interestRateBonus || 0);
});

const effectiveRate = computed(() => {
  if (!product.value) return 0;
  return (Number(product.value.baseRate) || 0) + vipBonus.value;
});

const expectedInterest = computed(() => {
  if (!product.value) return '0';
  return calcInterest(String(amount.value), String(effectiveRate.value), product.value.lockupDays);
});

const maturityDate = computed(() => {
  if (!product.value) return '';
  return new Date(Date.now() + product.value.lockupDays * 86400_000).toLocaleDateString();
});

const available = computed(() => Number(walletStore.account?.available || 0));

const canSubmit = computed(() => {
  if (!product.value) return false;
  return amount.value >= Number(product.value.minAmount) && amount.value <= available.value;
});

async function subscribe() {
  if (!product.value || !userStore.currentUser) return;
  submitting.value = true;
  try {
    const r = await financeApi.subscribeFinanceMock({
      userId: userStore.currentUser.id,
      productId: product.value.id,
      principalAmount: amount.value.toFixed(2)
    });
    if (r.ok && r.order) {
      uni.showToast({ title: '订阅成功', icon: 'success' });
      setTimeout(() => go('/pages/finance/my-lockups'), 600);
    } else {
      uni.showToast({ title: r.message || '订阅失败', icon: 'none' });
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view v-if="product" class="detail-page">
    <view class="hero">
      <text class="name">{{ product.name }}</text>
      <text class="rate">{{ formatRate(effectiveRate / 100) }}</text>
      <text class="rate-meta">基准 {{ product.baseRate }}% + VIP 加成 {{ vipBonus.toFixed(2) }}%</text>
    </view>

    <view class="info">
      <view class="info-row"><text class="lbl">锁定期</text><text>{{ product.lockupDays }} 天</text></view>
      <view class="info-row"><text class="lbl">起投</text><text>U {{ formatAmount(product.minAmount) }}</text></view>
      <view class="info-row"><text class="lbl">可用余额</text><text>U {{ formatAmount(available.toFixed(2)) }}</text></view>
    </view>

    <view class="calc">
      <text class="calc-title">利息计算器</text>
      <wd-input v-model="amount" label="投入金额" type="digit" placeholder="USDT" />
      <view class="calc-row"><text class="lbl">预计利息</text><text class="val accent">U {{ formatAmount(expectedInterest) }}</text></view>
      <view class="calc-row"><text class="lbl">预计到期</text><text class="val">{{ maturityDate }}</text></view>
    </view>

    <view class="rules">
      <text class="title">收益规则</text>
      <text class="desc">{{ product.description || '每日按日利率累计利息，到期后自动转入「不可提现」桶' }}</text>
      <text class="warn">⚠️ 提前解锁会立即终止本期小金库，损失全部预期利息</text>
    </view>

    <view class="footer-space" />

    <view class="bottom-bar">
      <wd-button type="primary" block :disabled="!canSubmit" :loading="submitting" @click="subscribe">
        立即订阅 U {{ amount }}
      </wd-button>
    </view>
  </view>
  <EmptyState v-else title="小金库产品不存在" />
</template>

<style lang="scss" scoped>
.detail-page {
  min-height: 100%;
  background: #FAFAF7;
  padding-bottom: 200rpx;
}
.hero {
  background: #FFFFFF;
  border-bottom: 1rpx solid #EDECE6;
  color: #0F111A;
  padding: 56rpx 32rpx;
  text-align: center;
}
.name {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  color: #86909C;
}
.rate {
  display: block;
  font-size: 96rpx;
  font-weight: 700;
  font-family: ui-monospace, monospace;
  color: #00A88A;
  letter-spacing: -3rpx;
  margin: 16rpx 0 8rpx;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.rate-meta {
  font-size: 22rpx;
  color: #86909C;
}
.info, .calc, .rules {
  background: #fff;
  padding: 24rpx 32rpx;
  margin-top: 16rpx;
}
.info-row, .calc-row {
  display: flex;
  justify-content: space-between;
  padding: 12rpx 0;
  font-size: 26rpx;
}
.lbl { color: #86909c; }
.val { font-weight: 600; }
.val.accent { color: #00A88A; font-size: 30rpx; font-family: ui-monospace, monospace; }
.calc-title, .title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
}
.desc {
  font-size: 24rpx;
  color: #4e5969;
  line-height: 1.6;
  display: block;
}
.warn {
  display: block;
  margin-top: 16rpx;
  font-size: 22rpx;
  color: #ff7d00;
}
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-top: 1rpx solid #f2f3f5;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
}
</style>
