<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { createRecharge, fetchRechargeAddress, fetchRechargeChains, fetchRechargeDetail } from '@/service/api/wallet';
import { go } from '@/utils/navigate';

const form = reactive<{ chain: string; amount: number }>({ chain: '', amount: 100 });
const submitting = ref(false);
const detail = ref<Api.RealWallet.RechargeVO>();
const rechargeAddress = ref<Api.RealWallet.RechargeAddressVO>();
const addressLoading = ref(false);
const chains = ref<Api.RealWallet.RechargeChainVO[]>([]);
const chainsLoading = ref(false);
let pollingTimer: ReturnType<typeof setInterval> | undefined;

const selectedChain = computed(() => chains.value.find(item => item.chain === form.chain));
const canSubmit = computed(() => {
  const amount = Number(form.amount);
  const minAmount = selectedChain.value?.minAmount;
  return !!selectedChain.value && amount > 0 && (minAmount === undefined || amount >= Number(minAmount));
});

async function loadRechargeChains() {
  chainsLoading.value = true;
  rechargeAddress.value = undefined;
  try {
    chains.value = (await fetchRechargeChains()).filter(item => item.enabled !== false);
    form.chain = chains.value[0]?.chain || '';
    if (!form.chain) uni.showToast({ title: '当前暂无开放的充值链', icon: 'none' });
  } catch (error) {
    chains.value = [];
    form.chain = '';
    uni.showToast({ title: error instanceof Error ? error.message : '充值链列表加载失败', icon: 'none' });
  } finally {
    chainsLoading.value = false;
  }
}

async function loadRechargeAddress() {
  if (!form.chain) return;
  addressLoading.value = true;
  rechargeAddress.value = undefined;
  try {
    rechargeAddress.value = await fetchRechargeAddress(form.chain);
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '充值地址加载失败', icon: 'none' });
  } finally {
    addressLoading.value = false;
  }
}

function copy(value?: string) {
  if (!value) return;
  uni.setClipboardData({ data: value, success: () => uni.showToast({ title: '已复制', icon: 'none' }) });
}

async function refreshDetail(showError = true) {
  if (!detail.value?.id) return;
  try {
    detail.value = await fetchRechargeDetail(detail.value.id);
    if (detail.value.status !== 'PENDING' && pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = undefined;
    }
  } catch (error) {
    if (showError) uni.showToast({ title: error instanceof Error ? error.message : '充值状态刷新失败', icon: 'none' });
  }
}

function startPolling() {
  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = setInterval(() => refreshDetail(false), 5000);
}

function submit() {
  if (!canSubmit.value || submitting.value) {
    const minAmount = selectedChain.value?.minAmount;
    return uni.showToast({ title: minAmount === undefined ? '请输入有效充值金额' : `充值金额不得低于 ${minAmount} U`, icon: 'none' });
  }
  uni.showModal({
    title: '确认创建申报单',
    content: `确认创建 ${form.amount} U 的 ${selectedChain.value?.label || form.chain} 充值申报单吗？仅在已完成链上转账后创建。`,
    confirmText: '确认创建',
    success: async result => {
      if (!result.confirm || submitting.value) return;
      await createDeclaration();
    }
  });
}

async function createDeclaration() {
  submitting.value = true;
  try {
    const id = await createRecharge({ chain: form.chain, amount: Number(form.amount) });
    detail.value = await fetchRechargeDetail(id);
    uni.showToast({ title: '充值单已创建', icon: 'success' });
    if (detail.value.status === 'PENDING') startPolling();
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '充值单创建失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

onUnmounted(() => {
  if (pollingTimer) clearInterval(pollingTimer);
});

onMounted(loadRechargeChains);
watch(() => form.chain, loadRechargeAddress);
</script>

<template>
  <view class="deposit-page">
    <view class="form-card">
      <text class="title">链上充值</text>
      <text class="tip">选择链后，使用专属地址直接转账即可到账；创建申报单仅用于留存本次金额。</text>
      <wd-cell title="链选择">
        <text v-if="chainsLoading" class="tip">正在加载开放充值链…</text>
        <wd-radio-group v-else-if="chains.length" v-model="form.chain" inline>
          <wd-radio v-for="item in chains" :key="item.chain" :value="item.chain">{{ item.label || item.chain }}</wd-radio>
        </wd-radio-group>
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
      <wd-input v-model="form.amount" label="充值金额" type="digit" placeholder="USDT" />
      <wd-button type="primary" block :disabled="!canSubmit" :loading="submitting" class="submit-btn" @click="submit">创建充值申报单（可选）</wd-button>
    </view>

    <view v-if="detail" class="detail-card">
      <view class="detail-head">
        <text class="title">转账信息</text>
        <wd-tag :type="detail.status === 'CONFIRMED' ? 'success' : detail.status === 'CANCELED' ? 'danger' : 'warning'">
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
      <text>查看充值记录</text><text>›</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.deposit-page { min-height: 100%; box-sizing: border-box; padding: 16rpx; background: #f7f8fa; }
.form-card, .detail-card, .record-entry { margin-bottom: 16rpx; padding: 24rpx; border-radius: 16rpx; background: #fff; }
.title { font-size: 28rpx; font-weight: 600; color: #1d2129; }
.tip { display: block; margin: 10rpx 0 20rpx; color: #86909c; font-size: 23rpx; line-height: 1.6; }
.submit-btn, .refresh-btn { margin-top: 20rpx; }
.detail-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12rpx; }
.row { display: flex; justify-content: space-between; gap: 20rpx; padding: 18rpx 0; border-bottom: 1rpx solid #f7f8fa; font-size: 24rpx; }
.label { color: #86909c; }
.value { color: #1d2129; font-family: ui-monospace, monospace; }
.block-row { padding: 20rpx 0; border-bottom: 1rpx solid #f7f8fa; }
.block-value { display: block; margin: 10rpx 0; padding: 16rpx; border-radius: 8rpx; background: #f7f8fa; color: #1d2129; font-family: ui-monospace, monospace; font-size: 22rpx; word-break: break-all; }
.warning { display: block; margin-top: 20rpx; color: #ff7d00; font-size: 22rpx; line-height: 1.6; }
.record-entry { display: flex; justify-content: space-between; color: #4e5969; font-size: 24rpx; }
</style>
