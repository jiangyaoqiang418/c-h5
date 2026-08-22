<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { formatAmount } from '@/utils/format-bridge';
import { fetchBuyerDepositLedger, payBuyerDeposit, refundBuyerDeposit } from '@/service/api/buyer';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const ledgers = ref<Api.RealUser.BuyerDepositLedgerDTO[]>([]);
const loadFailed = ref(false);

const payPopup = ref(false);
const refundPopup = ref(false);
const amountInput = ref('');
let payIdempotencyKey = '';
let refundIdempotencyKey = '';

async function load() {
  loadFailed.value = false;
  await userStore.init();
  if (!userStore.currentUser) return;
  try {
    const page = await fetchBuyerDepositLedger({ pageNo: 1, pageSize: 50 });
    ledgers.value = [...page.records].sort((left, right) => Number(right.createdAt) - Number(left.createdAt));
  } catch (error) {
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '保证金流水加载失败', icon: 'none' });
  }
}
onShow(load);

const currentBalance = computed(() => ledgers.value[0]?.balanceAfter ?? 0);

function createIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function openPay() {
  amountInput.value = '';
  payIdempotencyKey = createIdempotencyKey();
  payPopup.value = true;
}

function openRefund() {
  amountInput.value = '';
  refundIdempotencyKey = createIdempotencyKey();
  refundPopup.value = true;
}

async function submitPay() {
  const v = Number(amountInput.value);
  if (!v || v <= 0) return uni.showToast({ title: '金额无效', icon: 'none' });
  uni.showLoading({ title: '处理中…' });
  try {
    await payBuyerDeposit({ amount: v, idempotencyKey: payIdempotencyKey || createIdempotencyKey() });
    uni.showToast({ title: '保证金缴纳成功', icon: 'success' });
    payPopup.value = false;
    payIdempotencyKey = '';
    await load();
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '保证金缴纳失败', icon: 'none' });
  } finally {
    uni.hideLoading();
  }
}

async function submitRefund() {
  const v = Number(amountInput.value);
  if (!v || v <= 0) return uni.showToast({ title: '金额无效', icon: 'none' });
  uni.showLoading({ title: '处理中…' });
  try {
    await refundBuyerDeposit({ amount: v, idempotencyKey: refundIdempotencyKey || createIdempotencyKey() });
    uni.showToast({ title: '保证金退还成功', icon: 'success' });
    refundPopup.value = false;
    refundIdempotencyKey = '';
    await load();
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '保证金退还失败', icon: 'none' });
  } finally {
    uni.hideLoading();
  }
}

function bizTypeText(type: Api.RealUser.BuyerDepositBizType): string {
  return ({ PAY: '缴纳保证金', REFUND: '退还保证金', DEDUCT: '保证金扣罚', FREEZE: '保证金冻结', UNFREEZE: '保证金解冻' })[type];
}
</script>

<template>
  <view class="dep-page">
    <view class="hero">
      <text class="hero-label">当前保证金余额 (USDT)</text>
      <text class="hero-amount">U {{ formatAmount(currentBalance) }}</text>

      <view class="meter">
        <view class="meter-info">
          <text>以最新真实保证金流水余额为准</text>
          <text>共 {{ ledgers.length }} 条记录</text>
        </view>
      </view>

      <view class="hero-cells">
        <view class="cell">
          <text class="cell-lbl">最新余额</text>
          <text class="cell-val">{{ formatAmount(currentBalance) }}</text>
        </view>
        <view class="cell">
          <text class="cell-lbl">最新类型</text>
          <text class="cell-val">{{ ledgers[0] ? bizTypeText(ledgers[0].bizType) : '暂无' }}</text>
        </view>
      </view>

      <view class="hero-actions">
        <wd-button type="primary" @click="openPay">缴纳保证金</wd-button>
        <wd-button plain @click="openRefund">退还保证金</wd-button>
      </view>
    </view>

    <view class="section">
      <text class="section-title">押金流水</text>
      <view v-if="ledgers.length">
        <view v-for="t in ledgers" :key="String(t.id)" class="txn-row">
          <view class="txn-main">
            <text class="txn-title">{{ bizTypeText(t.bizType) }}</text>
            <text v-if="t.remark" class="txn-remark">{{ t.remark }}</text>
            <text class="txn-time">{{ new Date(t.createdAt).toLocaleString() }}</text>
          </view>
          <view class="txn-side">
            <text class="txn-amount">U {{ formatAmount(t.amount) }}</text>
            <text class="txn-balance">余额 {{ formatAmount(t.balanceAfter) }}</text>
          </view>
        </view>
      </view>
      <text v-else-if="loadFailed" class="empty-text">保证金流水加载失败，请稍后重试</text>
      <text v-else class="empty-text">暂无押金流水</text>
    </view>

    <wd-popup v-model="payPopup" position="bottom" :safe-area-inset-bottom="true">
      <view class="popup">
        <text class="popup-title">缴纳保证金</text>
        <wd-input v-model="amountInput" label="金额 (USDT)" type="digit" />
        <text class="popup-hint">将从钱包可用余额划入保证金，重复提交只会生效一次。</text>
        <wd-button type="primary" block class="popup-btn" @click="submitPay">确认缴纳</wd-button>
      </view>
    </wd-popup>

    <wd-popup v-model="refundPopup" position="bottom" :safe-area-inset-bottom="true">
      <view class="popup">
        <text class="popup-title">退还保证金</text>
        <text class="popup-hint">仅可退未被在途订单冻结的部分，实际可退金额以后端校验为准。</text>
        <wd-input v-model="amountInput" label="金额 (USDT)" type="digit" />
        <wd-button type="primary" block class="popup-btn" @click="submitRefund">确认退还</wd-button>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
.dep-page { min-height: 100%; background: #f7f8fa; }
.hero { background: linear-gradient(135deg, #722ed1 0%, #4d80f0 100%); color: #fff; padding: 48rpx 32rpx; }
.hero-label { display: block; font-size: 22rpx; opacity: 0.8; }
.hero-amount { display: block; font-size: 64rpx; font-weight: 700; font-family: ui-monospace, monospace; margin: 12rpx 0 24rpx; }
.meter-info { display: flex; justify-content: space-between; font-size: 22rpx; margin-top: 8rpx; opacity: 0.85; }
.hero-cells { display: flex; gap: 16rpx; margin-top: 24rpx; }
.cell { flex: 1; background: rgba(255,255,255,0.12); border-radius: 12rpx; padding: 16rpx; }
.cell-lbl { display: block; font-size: 22rpx; opacity: 0.8; }
.cell-val { display: block; font-size: 32rpx; font-weight: 700; font-family: ui-monospace, monospace; margin-top: 4rpx; }
.hero-actions { display: flex; gap: 12rpx; margin-top: 24rpx; }
.hero-actions > * { flex: 1; }
.section { background: #fff; margin-top: 16rpx; padding: 24rpx; }
.section-title { display: block; font-size: 28rpx; font-weight: 600; margin-bottom: 16rpx; }
.txn-row { display: flex; justify-content: space-between; align-items: center; padding: 16rpx 0; border-bottom: 1rpx solid #f2f3f5; }
.txn-main { display: flex; flex-direction: column; }
.txn-title { font-size: 24rpx; }
.txn-remark { font-size: 22rpx; color: #4e5969; margin-top: 4rpx; }
.txn-time { font-size: 22rpx; color: #86909c; margin-top: 4rpx; }
.txn-side { display: flex; flex-direction: column; align-items: flex-end; }
.txn-amount { font-size: 28rpx; font-weight: 700; font-family: ui-monospace, monospace; }
.txn-balance { font-size: 22rpx; color: #86909c; margin-top: 4rpx; }
.empty-text { display: block; text-align: center; color: #86909c; padding: 32rpx 0; font-size: 24rpx; }
.popup { padding: 24rpx; }
.popup-title { display: block; font-size: 30rpx; font-weight: 600; margin-bottom: 16rpx; }
.popup-hint { display: block; font-size: 22rpx; color: #86909c; margin-bottom: 16rpx; }
.popup-btn { margin-top: 16rpx; }
</style>
