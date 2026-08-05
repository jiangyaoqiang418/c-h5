<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { formatAmount } from '@/utils/format-bridge';
import { useUserStore, useWalletStore } from '@/stores';
import { createWithdraw } from '@/service/api/wallet';
import { go } from '@/utils/navigate';

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
const canSubmit = computed(() =>
  form.amount > 0 && form.toAddress.length > 0 && form.agreed && form.amount <= available.value
);

onMounted(async () => {
  await userStore.init();
  if (!userStore.currentUser) return;
  try {
    await walletStore.fetchWallet();
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '钱包数据加载失败', icon: 'none' });
  }
});

function confirmWithdraw() {
  uni.showModal({
    title: '确认转出',
    content: `确认提交 ${form.amount} U 的提现申请？实际手续费及到账金额以后端处理结果为准。`,
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
    const id = await createWithdraw({
      amount: form.amount,
      chain: form.chain,
      toAddress: form.toAddress
    });
    uni.showToast({ title: '申请已提交', icon: 'success' });
    await walletStore.refetch();
    setTimeout(() => go(`/pages/wallet/withdraw-detail?id=${encodeURIComponent(String(id))}`, true), 800);
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '提现申请失败', icon: 'none' });
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
.balance-card, .form-card, .agree-row {
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
.agree-row {
  font-size: 24rpx;
}
.submit-btn {
  margin-top: 16rpx;
}
</style>
