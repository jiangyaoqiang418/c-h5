<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import { usePageOperation } from '@/utils/page-operation';
import { getAccessToken } from '@/service/request/token';
import { useSubmissionGuard } from '@/utils/submission-guard';
import SubmissionWarning from '@/components/common/submission-warning.vue';
import { createRecharge, fetchRechargeAddress, fetchRechargeChains, fetchRechargeDetail } from '@/service/api/wallet';
import { go, useNavigationGuards } from '@/utils/navigate';
import { useUserStore } from '@/stores';

const { requireLogin } = useNavigationGuards();

const form = reactive<{ chain: string; amount: number }>({ chain: '', amount: 100 });
const submitting = ref(false);
const userStore = useUserStore();
const detail = ref<Api.RealWallet.RechargeVO>();
const submittedId = ref<string | number>();
const guard = useSubmissionGuard('recharge', '/pages/wallet/recharge-list');
const { uncertain, running } = guard;
const rechargeAddress = ref<Api.RealWallet.RechargeAddressVO>();
const addressLoading = ref(false);
const chains = ref<Api.RealWallet.RechargeChainVO[]>([]);
const chainsLoading = ref(false);
const chainsLoadFailed = ref(false);
const addressLoadFailed = ref(false);
const detailLoading = ref(false);
const detailLoadFailed = ref(false);
const page = usePageOperation(() => {
  invalidateReads();
  form.chain = '';
  form.amount = 100;
  chains.value = [];
  rechargeAddress.value = undefined;
  detail.value = undefined;
  submittedId.value = undefined;
  submitting.value = false;
  chainsLoadFailed.value = false;
  addressLoadFailed.value = false;
  detailLoadFailed.value = false;
});
let pollingTimer: ReturnType<typeof setTimeout> | undefined;
let chainsLoadToken = 0;
let addressLoadToken = 0;
let detailLoadToken = 0;

function stopPolling() {
  if (pollingTimer !== undefined) clearTimeout(pollingTimer);
  pollingTimer = undefined;
}

function invalidateReads() {
  stopPolling();
  chainsLoadToken++;
  addressLoadToken++;
  detailLoadToken++;
  chainsLoading.value = false;
  addressLoading.value = false;
  detailLoading.value = false;
  rechargeAddress.value = undefined;
}

const selectedChain = computed(() => chains.value.find(item => item.chain === form.chain));
const canSubmit = computed(() => {
  const amount = Number(form.amount);
  const minAmount = selectedChain.value?.minAmount;
  return page.visible.value && !!userStore.currentUser && !chainsLoading.value && !chainsLoadFailed.value
    && !uncertain.value && !running.value && submittedId.value == null && !!selectedChain.value
    && Number.isFinite(amount) && amount > 0
    && (minAmount == null || (String(minAmount).trim() !== '' && Number.isFinite(Number(minAmount)) && Number(minAmount) >= 0 && amount >= Number(minAmount)));
});

async function loadRechargeChains() {
  if (!page.visible.value || !userStore.currentUser || submitting.value) return;
  const operation = page.capture();
  const token = ++chainsLoadToken;
  const current = () => operation.isCurrent() && token === chainsLoadToken;
  chainsLoading.value = true;
  chainsLoadFailed.value = false;
  addressLoadToken++;
  addressLoading.value = false;
  rechargeAddress.value = undefined;
  try {
    const result = await fetchRechargeChains();
    if (!current()) return;
    chains.value = result.filter(item => item.enabled !== false);
    const previousChain = form.chain;
    if (!chains.value.some(item => item.chain === previousChain)) form.chain = chains.value[0]?.chain || '';
    if (form.chain === previousChain) void loadRechargeAddress();
    if (!current()) return;
    if (!form.chain) uni.showToast({ title: '当前暂无开放的充值链', icon: 'none' });
  } catch (error) {
    if (!current()) return;
    chainsLoadFailed.value = true;
    addressLoadToken++;
    addressLoading.value = false;
    rechargeAddress.value = undefined;
    uni.showToast({ title: error instanceof Error ? error.message : '充值链列表加载失败', icon: 'none' });
  } finally {
    if (current()) chainsLoading.value = false;
  }
}

async function loadRechargeAddress() {
  if (!page.visible.value) return;
  const operation = page.capture();
  const chain = form.chain;
  const token = ++addressLoadToken;
  const current = () => operation.isCurrent() && token === addressLoadToken && chain === form.chain;
  addressLoadFailed.value = false;
  if (!chain || !userStore.currentUser || !selectedChain.value || chainsLoadFailed.value) {
    rechargeAddress.value = undefined;
    addressLoading.value = false;
    return;
  }
  addressLoading.value = true;
  rechargeAddress.value = undefined;
  try {
    const address = await fetchRechargeAddress(chain);
    if (!current()) return;
    if (address.chain !== chain || !address.address?.trim()) throw new Error('充值地址与所选链不匹配或地址缺失，请重试');
    rechargeAddress.value = address;
  } catch (error) {
    if (current()) {
      addressLoadFailed.value = true;
      uni.showToast({ title: error instanceof Error ? error.message : '充值地址加载失败', icon: 'none' });
    }
  } finally {
    if (current()) addressLoading.value = false;
  }
}

function copy(value?: string) {
  if (!value || !page.visible.value || !userStore.currentUser) return;
  const operation = page.capture();
  uni.setClipboardData({ data: value, success: () => { if (operation.isCurrent()) uni.showToast({ title: '已复制', icon: 'none' }); } });
}

async function refreshDetail(showError = true) {
  const id = submittedId.value;
  if (id == null || !page.visible.value || !userStore.currentUser || detailLoading.value) return;
  stopPolling();
  const operation = page.capture();
  const token = ++detailLoadToken;
  const current = () => operation.isCurrent() && token === detailLoadToken && submittedId.value === id;
  detailLoading.value = true;
  try {
    const result = await fetchRechargeDetail(id);
    if (!current()) return;
    if (String(result.id) !== String(id)) throw new Error('充值回读记录不匹配，请重新核对');
    detail.value = result;
    detailLoadFailed.value = false;
  } catch (error) {
    if (!current()) return;
    detailLoadFailed.value = true;
    if (showError) uni.showToast({ title: error instanceof Error ? error.message : '充值状态刷新失败', icon: 'none' });
  } finally {
    if (current()) {
      detailLoading.value = false;
      if (detail.value?.status === 'PENDING') {
        pollingTimer = setTimeout(() => {
          pollingTimer = undefined;
          if (current()) void refreshDetail(false);
        }, 5000);
      }
    }
  }
}

function viewRecord() {
  if (!page.visible.value || submittedId.value == null || !userStore.currentUser) return;
  go(`/pages/wallet/recharge-detail?id=${encodeURIComponent(String(submittedId.value))}`);
}

async function submit() {
  if (!canSubmit.value || submitting.value) return;
  const operation = page.capture();
  const request = { chain: form.chain, amount: Number(form.amount) };
  const terms = JSON.stringify([selectedChain.value?.label || request.chain, selectedChain.value?.minAmount == null ? null : String(selectedChain.value.minAmount)]);
  const unchanged = () => form.chain === request.chain && Number(form.amount) === request.amount;
  submitting.value = true;
  try {
    const result = await uni.showModal({
      title: '确认创建申报单',
      content: `确认创建 ${request.amount} U 的 ${selectedChain.value?.label || request.chain} 充值申报单吗？仅在已完成链上转账后创建。`,
      confirmText: '确认创建'
    });
    if (!result.confirm || !operation.isCurrent() || !canSubmit.value) return;
    if (!unchanged()) {
      uni.showToast({ title: '充值链或金额已变化，请重新确认', icon: 'none' });
      return;
    }
    let latest: Api.RealWallet.RechargeChainVO[];
    try { latest = await fetchRechargeChains(); }
    catch (error) {
      if (operation.isCurrent()) {
        chainsLoadFailed.value = true;
        addressLoadToken++;
        addressLoading.value = false;
        rechargeAddress.value = undefined;
      }
      throw error;
    }
    if (!operation.isCurrent()) return;
    chains.value = latest.filter(item => item.enabled !== false);
    if (!selectedChain.value) {
      addressLoadToken++;
      addressLoading.value = false;
      rechargeAddress.value = undefined;
    }
    const latestTerms = JSON.stringify([selectedChain.value?.label || request.chain, selectedChain.value?.minAmount == null ? null : String(selectedChain.value.minAmount)]);
    if (!canSubmit.value || !unchanged() || latestTerms !== terms) {
      uni.showToast({ title: '充值条件已变化，请核对后重新确认', icon: 'none' });
      return;
    }
    const id = await guard.run(() => createRecharge(request));
    if (!operation.sameSession()) return;
    submittedId.value = id;
    if (!operation.isCurrent()) return;
    uni.showToast({ title: '充值单已创建', icon: 'success' });
    await refreshDetail();
  } catch (error) {
    if (!operation.isCurrent()) return;
    uni.showToast({ title: error instanceof Error ? error.message : '充值单创建失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) {
      submitting.value = false;
      if (page.visible.value && !operation.isCurrent()) void loadPage();
    }
  }
}

async function loadPage() {
  if (!page.visible.value || submitting.value) return;
  const operation = page.capture();
  try {
    await userStore.init();
    if (!operation.isCurrent()) return;
    if (!userStore.currentUser) {
      if (getAccessToken()) throw new Error('账户资料加载失败，请重试');
      await requireLogin('/pages/wallet/deposit');
      return;
    }
    guard.refresh();
    await Promise.all([loadRechargeChains(), refreshDetail(false)]);
  } catch (error) {
    if (!operation.isCurrent()) return;
    chainsLoadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '充值信息加载失败', icon: 'none' });
  }
}

onHide(invalidateReads);
onShow(loadPage);
watch(() => form.chain, loadRechargeAddress);
</script>

<template>
  <view class="deposit-page yb-page">
    <SubmissionWarning :pending="uncertain" :running="running" @review="guard.review" @acknowledge="guard.acknowledge" />
    <view v-if="submittedId != null" class="detail-card">
      <text class="tip">充值申报单已创建，请查看本次记录，不要重复创建。</text>
      <text v-if="detailLoadFailed" class="warning">到账状态暂未更新，创建回执仍保留。请刷新或进入详情核对。</text>
      <wd-button plain size="small" :loading="detailLoading" @click="refreshDetail()">刷新本次记录</wd-button>
      <wd-button plain size="small" @click="viewRecord">查看本次申报</wd-button>
    </view>
    <view v-if="!userStore.currentUser || chainsLoadFailed" class="detail-card">
      <text class="tip">{{ userStore.currentUser ? '充值链信息加载失败，暂不能创建申报单' : '请先登录并加载账户资料，以获取专属充值地址' }}</text>
      <wd-button plain size="small" :loading="chainsLoading" @click="loadPage">登录或重试</wd-button>
    </view>
    <view class="form-card">
      <text class="title">链上充值</text>
      <text class="tip">选择链后，使用专属地址直接转账即可到账；创建申报单仅用于留存本次金额。</text>
      <wd-cell title="链选择">
        <text v-if="!userStore.currentUser" class="tip">登录后读取开放充值链</text>
        <text v-else-if="chainsLoading" class="tip">正在加载开放充值链…</text>
        <wd-radio-group v-else-if="chains.length" v-model="form.chain" inline>
          <wd-radio v-for="item in chains" :key="item.chain" :value="item.chain">{{ item.label || item.chain }}</wd-radio>
        </wd-radio-group>
        <text v-else-if="chainsLoadFailed" class="tip">充值链列表加载失败，请稍后重试</text>
        <text v-else class="tip">暂无可用充值链</text>
      </wd-cell>
      <view v-if="rechargeAddress" class="block-row">
        <text class="label">专属充值地址</text>
        <text class="block-value">{{ rechargeAddress.address }}</text>
        <wd-button plain size="small" @click="copy(rechargeAddress.address)">复制地址</wd-button>
        <text v-if="rechargeAddress.memo" class="tip">Memo / Tag：{{ rechargeAddress.memo }}</text>
        <text v-if="rechargeAddress.minAmount" class="tip">建议最低充值：{{ rechargeAddress.minAmount }} USDT</text>
      </view>
      <text v-else-if="addressLoading" class="tip">正在加载专属充值地址…</text>
      <view v-else-if="addressLoadFailed">
        <text class="warning">专属充值地址加载失败，请勿使用其他链或账号的地址。</text>
        <wd-button plain size="small" @click="loadRechargeAddress">重试地址</wd-button>
      </view>
      <wd-input v-model="form.amount" label="充值金额" type="digit" placeholder="USDT" />
      <wd-button type="primary" block :disabled="!canSubmit || submitting" :loading="submitting" class="submit-btn" @click="submit">创建充值申报单（可选）</wd-button>
    </view>

    <view v-if="detail" class="detail-card">
      <view class="detail-head">
        <text class="title">转账信息</text>
        <wd-tag round :type="detail.status === 'CONFIRMED' ? 'success' : detail.status === 'CANCELED' ? 'danger' : 'warning'">
          {{ detail.statusText || detail.status }}
        </wd-tag>
      </view>
      <view class="row"><text class="label">充值单 ID</text><text class="value">{{ detail.id }}</text></view>
      <view class="row"><text class="label">链</text><text class="value">{{ detail.chain }}</text></view>
      <view class="row"><text class="label">金额</text><text class="value">U {{ detail.amount }}</text></view>
      <view class="block-row">
        <text class="label">平台充值地址</text>
        <text class="block-value">{{ detail.depositAddress || '-' }}</text>
        <wd-button plain size="small" @click="copy(detail.depositAddress)">复制地址</wd-button>
      </view>
      <view class="block-row">
        <text class="label">转账备注 Memo</text>
        <text class="block-value">{{ detail.memo || String(detail.id) }}</text>
        <wd-button plain size="small" @click="copy(detail.memo || String(detail.id))">复制备注</wd-button>
      </view>
      <text class="warning">请核对链、地址和备注。转错链或遗漏备注可能导致无法自动到账。</text>
      <wd-button v-if="detail.status === 'PENDING'" block plain class="refresh-btn" @click="refreshDetail()">刷新到账状态</wd-button>
      <wd-button block plain class="refresh-btn" @click="go('/pages/wallet/recharge-list')">查看充值记录</wd-button>
    </view>

    <view v-else class="record-entry" @click="go('/pages/wallet/recharge-list')">
      <text>查看充值记录</text><wd-icon name="arrow-right" size="16px" color="#a6a9b1" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.deposit-page { min-height: 100%; box-sizing: border-box; padding: 24rpx; }
.form-card, .detail-card, .record-entry { margin-bottom:20rpx; padding:24rpx; border-radius:var(--yb-radius-lg); background:#fff; border:1rpx solid var(--yb-border); box-shadow:var(--yb-shadow-card); }
.title { font-size: 28rpx; font-weight: 600; color: #1d2129; }
.tip { display: block; margin: 10rpx 0 20rpx; color: #86909c; font-size: 23rpx; line-height: 1.6; }
.submit-btn, .refresh-btn { margin-top: 20rpx; }
.detail-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx; }
.row { display: flex; justify-content: space-between; gap: 20rpx; padding: 18rpx 0; border-bottom: 1rpx solid #f7f8fa; font-size: 24rpx; }
.label { color: #86909c; }
.value { color: #1d2129; font-family: ui-monospace, monospace; }
.block-row { padding: 20rpx 0; border-bottom: 1rpx solid #f7f8fa; }
.block-value { display: block; margin:10rpx 0; padding:16rpx; border-radius:var(--yb-radius-md); background:var(--yb-bg-muted); color:#1d2129; font-family:ui-monospace,monospace; font-size:22rpx; word-break:break-all; }
.warning { display: block; margin-top: 20rpx; color: #ff7d00; font-size: 22rpx; line-height: 1.6; }
.record-entry { display: flex; justify-content: space-between; color: #4e5969; font-size: 24rpx; }
</style>
