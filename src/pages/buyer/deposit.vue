<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { buyerApi, walletApi } from '@shared';
import { formatAmount } from '@/utils/format-bridge';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const wallet = ref<Api.Buyer.Wallet>();
const profile = ref<Api.Buyer.BuyerProfile>();
const txns = ref<Api.Wallet.Txn[]>([]);

const rechargePopup = ref(false);
const transferOutPopup = ref(false);
const amountInput = ref('100');

async function load() {
  if (!userStore.currentUser) return;
  const r = await buyerApi.fetchBuyerDepositSummary(userStore.currentUser.id);
  wallet.value = r.wallet;
  profile.value = r.profile;
  const t = await walletApi.fetchMyTxns({
    userId: userStore.currentUser.id,
    types: ['DEPOSIT_PLEDGE', 'DEPOSIT_RELEASE', 'DEPOSIT_FORFEIT'],
    size: 20
  });
  txns.value = t.records;
}
onShow(load);

const total = computed(() => {
  if (!wallet.value) return 0;
  return Number(wallet.value.depositAvailable) + Number(wallet.value.depositGuaranteed);
});

const lockedPct = computed(() => {
  const t = total.value;
  if (t === 0) return 0;
  return Math.round((Number(wallet.value!.depositGuaranteed) / t) * 100);
});

async function doRecharge() {
  const v = Number(amountInput.value);
  if (!v || v <= 0) return uni.showToast({ title: '金额无效', icon: 'none' });
  uni.showLoading({ title: '处理中…' });
  await new Promise(r => setTimeout(r, 800));
  uni.hideLoading();
  uni.showToast({ title: '充值成功（模拟）', icon: 'success' });
  rechargePopup.value = false;
  load();
}

async function doTransferOut() {
  const v = Number(amountInput.value);
  if (!v || v <= 0) return uni.showToast({ title: '金额无效', icon: 'none' });
  if (wallet.value && v > Number(wallet.value.depositAvailable)) {
    return uni.showToast({ title: '余额不足', icon: 'none' });
  }
  uni.showLoading({ title: '处理中…' });
  await new Promise(r => setTimeout(r, 800));
  uni.hideLoading();
  uni.showToast({ title: '转出成功（模拟）', icon: 'success' });
  transferOutPopup.value = false;
  load();
}
</script>

<template>
  <view class="dep-page">
    <view class="hero">
      <text class="hero-label">押金总额 (USDT)</text>
      <text class="hero-amount">U {{ formatAmount(total) }}</text>

      <view class="meter">
        <view class="meter-bar">
          <view class="bar-fill" :style="{ width: lockedPct + '%' }" />
        </view>
        <view class="meter-info">
          <text>已担保 {{ lockedPct }}%</text>
          <text>可用 {{ 100 - lockedPct }}%</text>
        </view>
      </view>

      <view class="hero-cells">
        <view class="cell">
          <text class="cell-lbl">可用</text>
          <text class="cell-val">{{ wallet ? formatAmount(wallet.depositAvailable) : '0' }}</text>
        </view>
        <view class="cell">
          <text class="cell-lbl">已担保</text>
          <text class="cell-val">{{ wallet ? formatAmount(wallet.depositGuaranteed) : '0' }}</text>
        </view>
      </view>

      <view class="hero-actions">
        <wd-button type="primary" @click="(rechargePopup = true) && (amountInput = '100')">充值</wd-button>
        <wd-button plain @click="(transferOutPopup = true) && (amountInput = '100')">转出</wd-button>
      </view>
    </view>

    <view v-if="profile" class="section">
      <text class="section-title">买手画像</text>
      <view class="kv-grid">
        <view class="kv"><text class="k">订单总数</text><text class="v">{{ profile.stats.orderTotal }}</text></view>
        <view class="kv"><text class="k">完成率</text><text class="v">{{ profile.stats.completionRate.toFixed(1) }}%</text></view>
        <view class="kv"><text class="k">好评率</text><text class="v">{{ profile.stats.goodReviewRate.toFixed(1) }}%</text></view>
        <view class="kv"><text class="k">投诉率</text><text class="v">{{ profile.stats.complaintRate.toFixed(1) }}%</text></view>
      </view>
    </view>

    <view class="section">
      <text class="section-title">押金流水</text>
      <view v-if="txns.length">
        <view v-for="t in txns" :key="t.id" class="txn-row">
          <view class="txn-main">
            <text class="txn-title">{{ t.type }}</text>
            <text class="txn-time">{{ new Date(t.createdAt).toLocaleString() }}</text>
          </view>
          <text class="txn-amount" :class="{ pos: Number(t.amount) > 0, neg: Number(t.amount) < 0 }">{{ Number(t.amount) > 0 ? '+' : '' }}{{ formatAmount(t.amount) }}</text>
        </view>
      </view>
      <text v-else class="empty-text">暂无押金流水</text>
    </view>

    <wd-popup v-model="rechargePopup" position="bottom" :safe-area-inset-bottom="true">
      <view class="popup">
        <text class="popup-title">押金充值</text>
        <wd-input v-model="amountInput" label="金额 (USDT)" type="digit" />
        <wd-button type="primary" block class="popup-btn" @click="doRecharge">确认充值</wd-button>
      </view>
    </wd-popup>

    <wd-popup v-model="transferOutPopup" position="bottom" :safe-area-inset-bottom="true">
      <view class="popup">
        <text class="popup-title">押金转出</text>
        <text class="popup-hint">仅可用押金可转出，担保金额需先解冻</text>
        <wd-input v-model="amountInput" label="金额 (USDT)" type="digit" />
        <wd-button type="primary" block class="popup-btn" @click="doTransferOut">确认转出</wd-button>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
.dep-page { min-height: 100vh; background: #f7f8fa; }
.hero { background: linear-gradient(135deg, #722ed1 0%, #4d80f0 100%); color: #fff; padding: 48rpx 32rpx; }
.hero-label { display: block; font-size: 22rpx; opacity: 0.8; }
.hero-amount { display: block; font-size: 64rpx; font-weight: 700; font-family: ui-monospace, monospace; margin: 12rpx 0 24rpx; }
.meter-bar { height: 16rpx; background: rgba(255,255,255,0.2); border-radius: 8rpx; overflow: hidden; }
.bar-fill { height: 100%; background: #ff9a02; transition: width 0.4s; }
.meter-info { display: flex; justify-content: space-between; font-size: 22rpx; margin-top: 8rpx; opacity: 0.85; }
.hero-cells { display: flex; gap: 16rpx; margin-top: 24rpx; }
.cell { flex: 1; background: rgba(255,255,255,0.12); border-radius: 12rpx; padding: 16rpx; }
.cell-lbl { display: block; font-size: 22rpx; opacity: 0.8; }
.cell-val { display: block; font-size: 32rpx; font-weight: 700; font-family: ui-monospace, monospace; margin-top: 4rpx; }
.hero-actions { display: flex; gap: 12rpx; margin-top: 24rpx; }
.hero-actions > * { flex: 1; }
.section { background: #fff; margin-top: 16rpx; padding: 24rpx; }
.section-title { display: block; font-size: 28rpx; font-weight: 600; margin-bottom: 16rpx; }
.kv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16rpx; }
.kv { background: #f7f8fa; border-radius: 12rpx; padding: 16rpx; }
.k { display: block; font-size: 22rpx; color: #86909c; }
.v { display: block; font-size: 30rpx; font-weight: 700; color: #1d2129; margin-top: 4rpx; }
.txn-row { display: flex; justify-content: space-between; align-items: center; padding: 16rpx 0; border-bottom: 1rpx solid #f2f3f5; }
.txn-main { display: flex; flex-direction: column; }
.txn-title { font-size: 24rpx; }
.txn-time { font-size: 22rpx; color: #86909c; margin-top: 4rpx; }
.txn-amount { font-size: 28rpx; font-weight: 700; font-family: ui-monospace, monospace; }
.txn-amount.pos { color: #00b42a; }
.txn-amount.neg { color: #f53f3f; }
.empty-text { display: block; text-align: center; color: #86909c; padding: 32rpx 0; font-size: 24rpx; }
.popup { padding: 24rpx; }
.popup-title { display: block; font-size: 30rpx; font-weight: 600; margin-bottom: 16rpx; }
.popup-hint { display: block; font-size: 22rpx; color: #86909c; margin-bottom: 16rpx; }
.popup-btn { margin-top: 16rpx; }
</style>
