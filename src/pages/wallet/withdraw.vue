<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { walletApi } from '@shared';
import { formatAmount } from '@/utils/format-bridge';
import { useUserStore, useWalletStore } from '@/stores';

const userStore = useUserStore();
const walletStore = useWalletStore();
const form = reactive<{
  chain: 'TRON' | 'ETH' | 'BSC';
  toAddress: string;
  amount: number;
  agreed: boolean;
}>({ chain: 'TRON', toAddress: '', amount: 0, agreed: false });
const submitting = ref(false);

const available = computed(() => Number(walletStore.account?.available || 0));
const fee = computed(() => Number((form.amount * 0.005 + 2).toFixed(2)));
const total = computed(() => form.amount + fee.value);
const net = computed(() => Math.max(0, form.amount - fee.value));

const canSubmit = computed(() =>
  form.amount > 10 && form.toAddress.length > 25 && form.agreed && total.value <= available.value
);

onMounted(async () => {
  if (userStore.currentUser) await walletStore.fetchWallet(userStore.currentUser.id);
});

function confirmWithdraw() {
  uni.showModal({
    title: '确认转出',
    content: `金额 ${form.amount} U + 手续费 ${fee.value} U，实际到账 ${net.value} U`,
    confirmText: '确认转出',
    success: async r => {
      if (r.confirm) await doWithdraw();
    }
  });
}

async function doWithdraw() {
  if (!userStore.currentUser) return;
  submitting.value = true;
  try {
    const r = await walletApi.withdrawMock({
      userId: userStore.currentUser.id,
      amount: form.amount.toFixed(2),
      chain: form.chain,
      toAddress: form.toAddress
    });
    if (r.ok) {
      uni.showToast({ title: '转出成功', icon: 'success' });
      await walletStore.refetch();
      setTimeout(() => uni.navigateBack(), 800);
    } else {
      uni.showToast({ title: r.message || '失败', icon: 'none' });
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="withdraw-page">
    <view class="balance-card">
      <text class="lbl">可用余额</text>
      <text class="amount">U {{ formatAmount(available.toFixed(2)) }}</text>
    </view>

    <view class="form-card">
      <wd-cell title="链选择" :value="form.chain">
        <wd-radio-group v-model="form.chain" inline>
          <wd-radio value="TRON">TRC20</wd-radio>
          <wd-radio value="ETH">ERC20</wd-radio>
          <wd-radio value="BSC">BSC</wd-radio>
        </wd-radio-group>
      </wd-cell>
      <wd-input v-model="form.toAddress" label="目标地址" placeholder="请输入 USDT 收款地址" />
      <wd-input v-model="form.amount" label="转出金额" type="digit" placeholder="USDT" />
    </view>

    <view class="fee-card">
      <view class="fee-row"><text>燃料费</text><text>U 2.00</text></view>
      <view class="fee-row"><text>服务费 0.5%</text><text>U {{ (form.amount * 0.005).toFixed(2) }}</text></view>
      <view class="fee-row total"><text>总费用</text><text>U {{ fee.toFixed(2) }}</text></view>
      <view class="fee-row net"><text>实际到账</text><text>U {{ net.toFixed(2) }}</text></view>
    </view>

    <view class="agree-row">
      <wd-checkbox v-model="form.agreed" shape="square">
        <text>我已确认目标地址正确，知晓转出不可撤销</text>
      </wd-checkbox>
    </view>

    <wd-button
      type="primary"
      block
      :disabled="!canSubmit"
      :loading="submitting"
      class="submit-btn"
      @click="confirmWithdraw"
    >
      提交转出
    </wd-button>
  </view>
</template>

<style lang="scss" scoped>
.withdraw-page {
  min-height: 100vh;
  background: #f7f8fa;
  padding: 16rpx;
}
.balance-card, .form-card, .fee-card, .agree-row {
  background: #fff;
  padding: 24rpx;
  border-radius: 16rpx;
  margin-bottom: 16rpx;
}
.balance-card {
  text-align: center;
}
.lbl {
  display: block;
  font-size: 22rpx;
  color: #86909c;
}
.amount {
  display: block;
  font-size: 56rpx;
  font-weight: 700;
  color: #4d80f0;
  font-family: ui-monospace, monospace;
  margin-top: 8rpx;
}
.fee-row {
  display: flex;
  justify-content: space-between;
  padding: 8rpx 0;
  font-size: 24rpx;
  color: #4e5969;
}
.fee-row.total {
  border-top: 1rpx dashed #f2f3f5;
  margin-top: 8rpx;
  padding-top: 16rpx;
  font-weight: 600;
  color: #1d2129;
}
.fee-row.net {
  color: #00b42a;
  font-weight: 700;
  font-size: 26rpx;
}
.agree-row {
  font-size: 24rpx;
}
.submit-btn {
  margin-top: 16rpx;
}
</style>
