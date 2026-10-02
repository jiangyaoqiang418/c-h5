<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { useSubmissionGuard } from '@/utils/submission-guard';
import SubmissionWarning from '@/components/common/submission-warning.vue';
import { formatAmount } from '@/utils/format-bridge';
import { useUserStore, useWalletStore } from '@/stores';
import { go, useNavigationGuards } from '@/utils/navigate';
import { usePageOperation } from '@/utils/page-operation';
import PayPasswordPopup from '@/components/common/pay-password-popup.vue';

const { requireLogin } = useNavigationGuards();

const userStore = useUserStore();
const walletStore = useWalletStore();
const form = reactive<{
  chain: 'TRON' | 'ETH' | 'BSC';
  toAddress: string;
  amount: number;
  agreed: boolean;
}>({ chain: 'TRON', toAddress: '', amount: 0, agreed: false });
const touched = reactive({ address: false, amount: false });
const submitting = ref(false);
const guard = useSubmissionGuard('withdraw', '/pages/wallet/withdraw-list');
const { uncertain, running, submittedId, message, actionLabel } = guard;
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
  Object.assign(touched, { address: false, amount: false });
});
const payPasswordPopup = ref<InstanceType<typeof PayPasswordPopup>>();
async function continuePending() { const password = await payPasswordPopup.value?.request('/pages/wallet/withdraw'); if (password) await guard.acknowledge(password); }

const available = computed(() => {
  if (!userStore.currentUser || walletStore.account?.available == null) return undefined;
  const value = Number(walletStore.account.available);
  return Number.isFinite(value) ? value : undefined;
});
const addressValid = computed(() => form.chain === 'TRON'
  ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(form.toAddress.trim())
  : /^0x[0-9a-fA-F]{40}$/.test(form.toAddress.trim()));
const addressError = computed(() => !form.toAddress.trim() ? '请填写当前网络的收款地址' : !addressValid.value ? '地址格式与当前所选网络不匹配，请核对' : '');
const amountError = computed(() => !Number.isFinite(Number(form.amount)) || form.amount <= 0
  ? '请输入大于0的转出金额' : available.value !== undefined && form.amount > available.value ? '转出金额不能超过可用余额' : '');
const submitHint = computed(() => {
  if (submitting.value || running.value) return '正在处理申请，请勿重复提交';
  if (submittedId.value != null) return '申请已经提交，请先查看原申请详情';
  if (uncertain.value) return '上一笔申请结果待核对，请按上方提示处理';
  if (loading.value) return '正在读取钱包余额，请稍候';
  if (loadFailed.value) return '钱包信息读取失败，请先重试核对余额';
  if (!userStore.currentUser) return '请先登录并读取钱包资料';
  if (available.value === undefined) return '可用余额尚未取得，请刷新核对';
  return addressError.value || amountError.value || (!form.agreed ? '请勾选地址核对与转出不可撤销说明' : '');
});
const canSubmit = computed(() =>
  !!userStore.currentUser && !loading.value && !loadFailed.value && !uncertain.value && submittedId.value == null && Number.isFinite(Number(form.amount)) && form.amount > 0
  && addressValid.value
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
      content: `链：${request.chain}\n收款地址：${request.toAddress}\n金额：${request.amount} USDT\n实际手续费及到账金额以实际处理结果为准。`,
      confirmText: '确认转出'
    });
    if (!result.confirm || !operation.isCurrent()) return;
    if (!canSubmit.value || form.chain !== request.chain || form.toAddress.trim() !== request.toAddress || Number(form.amount) !== request.amount) {
      uni.showToast({ title: '转出信息或余额已变化，请重新确认', icon: 'none' });
      return;
    }
    const payPassword = await payPasswordPopup.value?.request('/pages/wallet/withdraw');
    if (!payPassword || !operation.isCurrent()) return;
    const id = await guard.run(request, payPassword);
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
    <SubmissionWarning :pending="uncertain || submittedId != null" :running="running" :message="message" :action-label="actionLabel" @review="guard.review" @acknowledge="continuePending" />
    <PayPasswordPopup ref="payPasswordPopup" />
    <wd-button v-if="loadFailed" block plain :loading="loading" @click="load">钱包数据加载失败，点击重试</wd-button>
    <wd-button v-if="submittedId != null" block plain @click="go(`/pages/wallet/withdraw-detail?id=${encodeURIComponent(String(submittedId))}`, true)">申请已提交，查看详情</wd-button>
    <view class="balance-card">
      <text class="lbl">可用余额</text>
      <text class="amount">{{ available === undefined ? '—' : formatAmount(walletStore.account?.available) }} <text class="unit">USDT</text></text>
      <text v-if="loading || loadFailed" class="balance-note">{{ loading ? '正在核对最新余额' : '余额读取失败，上次金额仅供核对，请重试' }}</text>
    </view>

    <view class="form-card">
      <view class="choice-field"><text class="choice-label">转出网络</text>
        <wd-radio-group v-model="form.chain" class="yb-choice-group" inline>
          <wd-radio shape="dot" icon-placement="left" value="TRON">TRC20</wd-radio>
          <wd-radio shape="dot" icon-placement="left" value="ETH">ERC20</wd-radio>
          <wd-radio shape="dot" icon-placement="left" value="BSC">BSC</wd-radio>
        </wd-radio-group>
      </view>
      <text class="field-label">目标地址</text>
      <wd-input v-model="form.toAddress" placeholder="请输入当前网络的 USDT 收款地址" @blur="touched.address = true" />
      <text v-if="touched.address && addressError" class="field-error">{{ addressError }}</text>
      <text class="field-label">转出金额（USDT）</text>
      <wd-input v-model="form.amount" type="digit" placeholder="请输入金额" @blur="touched.amount = true" />
      <text v-if="touched.amount && amountError" class="field-error">{{ amountError }}</text>
    </view>

    <view class="agree-row">
      <wd-checkbox v-model="form.agreed" shape="square">
        <text>我已确认目标地址正确，知晓转出不可撤销</text>
      </wd-checkbox>
    </view>

    <text v-if="submitHint" class="submit-hint">{{ submitHint }}</text>
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
  font-size: 24rpx;
  color: var(--yb-muted);
}
.amount {
  display: block;
  font-size: 44rpx;
  overflow-wrap: anywhere;
  font-weight: 700;
  color: var(--yb-ink);
  font-family: var(--yb-font-body);
  margin-top: 8rpx;
}
.agree-row {
  font-size: 24rpx;
}
.submit-btn {
  margin-top: 16rpx;
}
.choice-field { padding: 12rpx 0 24rpx; }
.choice-label { display: block; margin-bottom: 16rpx; font-size: 26rpx; color: var(--yb-ink-2); }
.field-label { display:block; margin:20rpx 0 8rpx; color:var(--yb-ink); font-size:26rpx; }
.field-error { display:block; margin:8rpx 0 16rpx; color:var(--yb-danger); font-size:24rpx; line-height:1.5; }
.submit-hint,.balance-note { display:block; color:var(--yb-muted); font-size:24rpx; line-height:1.6; }
.balance-note { margin-top:12rpx; }.unit { font-size:26rpx; font-weight:500; }
</style>
