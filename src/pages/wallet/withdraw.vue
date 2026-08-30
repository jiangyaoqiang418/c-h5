<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useSubmissionGuard } from '@/utils/submission-guard';
import SubmissionWarning from '@/components/common/submission-warning.vue';
import { formatAmount } from '@/utils/format-bridge';
import { useUserStore, useWalletStore } from '@/stores';
import { createWithdraw } from '@/service/api/wallet';
import { go, useNavigationGuards } from '@/utils/navigate';
import { usePageOperation } from '@/utils/page-operation';

const { requireLogin } = useNavigationGuards();

const userStore = useUserStore();
const walletStore = useWalletStore();
const form = reactive<{
  chain: 'TRON' | 'ETH' | 'BSC';
  toAddress: string;
  amount: number;
  agreed: boolean;
}>({ chain: 'TRON', toAddress: '', amount: 0, agreed: false });
const submitting = ref(false);
const submittedId = ref<string | number>();
const guard = useSubmissionGuard('withdraw', '/pages/wallet/withdraw-list');
const { uncertain, running } = guard;
const loading = ref(true);
const loadFailed = ref(false);
let loadSequence = 0;
const page = usePageOperation(() => {
  loadSequence++;
  submitting.value = false;
  submittedId.value = undefined;
  loading.value = false;
  loadFailed.value = true;
  Object.assign(form, { chain: 'TRON', toAddress: '', amount: 0, agreed: false });
});

const available = computed(() => {
  if (!userStore.currentUser || walletStore.account?.available == null) return undefined;
  const value = Number(walletStore.account.available);
  return Number.isFinite(value) ? value : undefined;
});
const canSubmit = computed(() =>
  !!userStore.currentUser && !loading.value && !loadFailed.value && !uncertain.value && submittedId.value == null && Number.isFinite(Number(form.amount)) && form.amount > 0
  && (form.chain === 'TRON' ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(form.toAddress.trim()) : /^0x[0-9a-fA-F]{40}$/.test(form.toAddress.trim()))
  && form.agreed && available.value !== undefined && form.amount <= available.value
);

async function load() {
  if (!page.visible.value || submitting.value) return;
  const operation = page.capture();
  const sequence = ++loadSequence;
  const valid = () => operation.isCurrent() && sequence === loadSequence;
  loading.value = true;
  loadFailed.value = false;
  try {
    await userStore.init();
    if (!valid()) return;
    if (!userStore.currentUser) { await requireLogin('/pages/wallet/withdraw'); return; }
    guard.refresh();
    await walletStore.fetchWallet();
  } catch (error) {
    if (!valid()) return;
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '钱包数据加载失败', icon: 'none' });
  } finally {
    if (operation.sameSession() && sequence === loadSequence) loading.value = false;
  }
}
onShow(load);

async function confirmWithdraw() {
  if (!page.visible.value || !canSubmit.value || submitting.value || running.value) return;
  const operation = page.capture();
  const request = { amount: Number(form.amount), chain: form.chain, toAddress: form.toAddress.trim() };
  submitting.value = true;
  try {
    const result = await uni.showModal({
      title: '确认转出',
      content: `链：${request.chain}\n收款地址：${request.toAddress}\n金额：${request.amount} U\n实际手续费及到账金额以后端处理结果为准。`,
      confirmText: '确认转出'
    });
    if (!result.confirm || !operation.isCurrent()) return;
    if (!canSubmit.value || form.chain !== request.chain || form.toAddress.trim() !== request.toAddress || Number(form.amount) !== request.amount) {
      uni.showToast({ title: '转出信息或余额已变化，请重新确认', icon: 'none' });
      return;
    }
    const id = await guard.run(() => createWithdraw(request));
    if (!operation.sameSession()) return;
    submittedId.value = id;
    if (!operation.isCurrent()) return;
    uni.showToast({ title: '申请已提交', icon: 'success' });
    go(`/pages/wallet/withdraw-detail?id=${encodeURIComponent(String(id))}`, true);
    walletStore.refetch().catch(() => undefined);
  } catch (error) {
    if (operation.isCurrent()) uni.showToast({ title: error instanceof Error ? error.message : '提现申请失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) submitting.value = false;
  }
}
</script>

<template>
  <view class="withdraw-page yb-page">
    <SubmissionWarning :pending="uncertain" :running="running" @review="guard.review" @acknowledge="guard.acknowledge" />
    <wd-button v-if="loadFailed" block plain :loading="loading" @click="load">钱包数据加载失败，点击重试</wd-button>
    <wd-button v-if="submittedId != null" block plain @click="go(`/pages/wallet/withdraw-detail?id=${encodeURIComponent(String(submittedId))}`, true)">申请已提交，查看详情</wd-button>
    <view class="balance-card">
      <text class="lbl">可用余额</text>
      <text class="amount">U {{ available === undefined ? '—' : formatAmount(available.toFixed(2)) }}</text>
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
      :disabled="!canSubmit || submitting || running"
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
  min-height: 100%;
  padding: 24rpx;
}
.balance-card, .form-card, .agree-row {
  background: #fff;
  padding: 24rpx;
  border-radius: var(--yb-radius-lg);
  margin-bottom: 20rpx;
  border:1rpx solid var(--yb-border);
  box-shadow:var(--yb-shadow-card);
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
  color: var(--yb-brand);
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
