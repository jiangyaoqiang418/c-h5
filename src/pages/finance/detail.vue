<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onLoad, onShow } from '@dcloudio/uni-app';
import { usePageOperation } from '@/utils/page-operation';
import { getAccessToken } from '@/service/request/token';
import { useSubmissionGuard } from '@/utils/submission-guard';
import SubmissionWarning from '@/components/common/submission-warning.vue';
import { fetchFinanceProductDetail, subscribeFinance } from '@/service/api/finance';
import { formatAmount, formatRate } from '@/utils/format-bridge';
import { go, useNavigationGuards } from '@/utils/navigate';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore, useWalletStore } from '@/stores';
import { UI_ASSETS } from '@/constants/ui-assets';

const { requireLogin } = useNavigationGuards();

const walletStore = useWalletStore();
const userStore = useUserStore();
const product = ref<Api.RealFinance.ProductVO>(); const amount = ref(''); const submitting = ref(false);
const submittedId = ref<Api.RealFinance.Id>();
const productId = ref('');
let loadSequence = 0;
const page = usePageOperation(() => {
  loadSequence++;
  product.value = undefined; amount.value = ''; submittedId.value = undefined;
  submitting.value = false; loading.value = false; loadFailed.value = false;
});
const guard = useSubmissionGuard('finance', '/pages/finance/my-lockups');
const { uncertain, running } = guard;
const loading = ref(true); const loadFailed = ref(false);
async function load() {
  if (!page.visible.value || submitting.value) return;
  const operation = page.capture();
  const sequence = ++loadSequence;
  loading.value = true;
  loadFailed.value = false;
  try {
    await userStore.init();
    if (!operation.isCurrent() || sequence !== loadSequence) return;
    if (!productId.value) return;
    if (!userStore.currentUser) {
      if (getAccessToken()) throw new Error('账户资料暂未加载成功');
      await requireLogin(`/pages/finance/detail?id=${encodeURIComponent(productId.value)}`);
      return;
    }
    guard.refresh();
    const latest = await fetchFinanceProductDetail(productId.value);
    if (!operation.isCurrent() || sequence !== loadSequence) return;
    if (String(latest.id) !== productId.value) throw new Error('理财产品信息不匹配');
    product.value = latest;
    if (!amount.value) amount.value = String(latest.minAmount);
    await walletStore.refetch();
  } catch (error) {
    if (operation.isCurrent() && sequence === loadSequence) {
      loadFailed.value = true;
      uni.showToast({ title: error instanceof Error ? error.message : '理财产品加载失败', icon: 'none' });
    }
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}
onLoad(query => { productId.value = String(query?.id || ''); });
onShow(load);
onHide(() => { loadSequence++; loading.value = false; });
function numeric(value: unknown): number | undefined {
  if (value == null || !/^\d+(\.\d+)?$/.test(String(value).trim())) return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}
const available = computed(() => userStore.currentUser && !loadFailed.value ? numeric(walletStore.account?.available) : undefined);
const expectedInterest = computed(() => {
  const principal = numeric(amount.value), rate = numeric(product.value?.annualRate), days = numeric(product.value?.lockDays);
  return principal == null || rate == null || days == null ? undefined : principal * rate * days / 365;
});
const canSubmit = computed(() => {
  const value = numeric(amount.value), min = numeric(product.value?.minAmount), max = product.value?.maxAmount == null ? undefined : numeric(product.value.maxAmount);
  const quota = product.value?.remainingQuota == null ? undefined : numeric(product.value.remainingQuota);
  return page.visible.value && !!userStore.currentUser && !loading.value && !loadFailed.value && !uncertain.value && !running.value && submittedId.value == null
    && value != null && value > 0 && min != null && value >= min && (product.value?.maxAmount == null || (max != null && value <= max))
    && (product.value?.remainingQuota == null || (quota != null && value <= quota)) && available.value != null && value <= available.value && product.value?.status === 'ON_SALE';
});
function terms(value: Api.RealFinance.ProductVO) { return JSON.stringify([String(value.id), value.name, String(value.annualRate), value.lockDays, String(value.minAmount), value.maxAmount == null ? null : String(value.maxAmount), value.status]); }
function viewHolding() { if (page.visible.value && submittedId.value != null) go('/pages/finance/my-lockups', true); }
async function subscribe() {
  if (!product.value || !canSubmit.value || submitting.value) return;
  const request = { productId: product.value.id, amount: amount.value };
  const snapshot = terms(product.value);
  const operation = page.capture();
  submitting.value = true;
  try {
    const result = await uni.showModal({
      title: '确认申购',
      content: `确认使用 U ${request.amount} 申购“${product.value.name}”吗？资金将锁定 ${product.value.lockDays} 天，实际收益以后端结算结果为准。`,
      confirmText: '确认申购'
    });
    if (!result.confirm || !operation.isCurrent() || request.amount !== amount.value || !canSubmit.value) return;
    let latest: Api.RealFinance.ProductVO;
    try {
      latest = await fetchFinanceProductDetail(request.productId);
      if (!operation.isCurrent()) return;
      await walletStore.refetch();
    } catch (error) {
      if (operation.isCurrent()) loadFailed.value = true;
      throw error;
    }
    if (!operation.isCurrent()) return;
    if (String(latest.id) !== String(request.productId)) throw new Error('理财产品信息不匹配');
    product.value = latest;
    if (snapshot !== terms(latest) || request.amount !== amount.value) throw new Error('申购条件已变化，请核对后重新确认');
    if (!canSubmit.value) throw new Error('当前余额、额度或申购条件不满足，请刷新后确认');
    const receipt = await guard.run(() => subscribeFinance(request));
    if (!operation.sameSession()) return;
    submittedId.value = receipt;
    if (operation.isCurrent()) {
      uni.showToast({ title: '申购成功', icon: 'success' });
      viewHolding();
    }
    walletStore.refetch().catch(() => undefined);
  } catch (error) {
    if (operation.isCurrent()) uni.showToast({ title: submittedId.value != null ? '申购已成功，请查看持仓记录' : error instanceof Error ? error.message : '申购失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) submitting.value = false;
  }
}
</script>

<template>
  <view>
  <SubmissionWarning :pending="uncertain" :running="running" @review="guard.review" @acknowledge="guard.acknowledge" />
  <wd-button v-if="submittedId != null" block plain @click="viewHolding">申购已成功，查看持仓记录</wd-button>
  <wd-button v-if="product && loadFailed" block plain :loading="loading" :disabled="submitting" @click="load">产品或余额读取失败，点击重试</wd-button>
  <view v-if="product" class="detail-page yb-page"><view class="hero" :style="{ backgroundImage: `url(${UI_ASSETS.backgrounds.finance})` }"><text class="name">{{ product.name }}</text><text class="rate">{{ numeric(product.annualRate) == null ? '—' : formatRate(Number(product.annualRate)) }}</text><text class="rate-meta">年化收益率 · 锁仓 {{ product.lockDays }} 天</text></view><view class="info"><view class="info-row"><text class="lbl">起投</text><text>U {{ formatAmount(product.minAmount) }}</text></view><view v-if="product.maxAmount" class="info-row"><text class="lbl">单笔上限</text><text>U {{ formatAmount(product.maxAmount) }}</text></view><view class="info-row"><text class="lbl">可用余额</text><text>{{ available == null ? '—' : `U ${formatAmount(available)}` }}</text></view></view><view class="calc"><text class="calc-title">申购金额</text><wd-input v-model="amount" label="投入金额" type="digit" placeholder="USDT" /><view class="calc-row"><text class="lbl">预计到期收益</text><text class="val accent">{{ expectedInterest == null ? '—' : `U ${formatAmount(expectedInterest)}` }}</text></view></view><view class="rules"><text class="title">产品说明</text><text class="desc">{{ product.description || '以订单快照及后端实际结算结果为准。' }}</text><text v-if="product.earlyRedeemEnabled" class="warn">提前赎回可用性与可得收益以订单详情返回值为准。</text></view><view class="bottom-bar"><wd-button type="primary" block :disabled="!canSubmit" :loading="submitting" @click="subscribe">立即申购 U {{ amount }}</wd-button></view></view><view v-else-if="loading" class="loading"><wd-loading size="44rpx" /><text>正在加载小金库产品</text></view><EmptyState v-else-if="loadFailed" title="小金库产品加载失败" description="请检查网络后重试" action-text="重新加载" @action="load" /><EmptyState v-else-if="productId && !userStore.currentUser" title="请先登录查看理财产品" action-text="登录或重试" @action="load" /><EmptyState v-else title="小金库产品不存在" />
  </view>
</template>

<style lang="scss" scoped>.detail-page { min-height:100%; padding:24rpx 24rpx 200rpx; }.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }.hero { background-color:#432e12; background-size:cover; background-position:center; color:#fff; padding:56rpx 32rpx; text-align:center; border-radius:var(--yb-radius-lg); }.name { display:block; font-size:32rpx; font-weight:600; color:rgba(255,255,255,.74); }.rate { display:block; font-size:96rpx; font-weight:700; font-family:ui-monospace,monospace; color:#fff; margin:16rpx 0 8rpx; }.rate-meta { font-size:22rpx; color:rgba(255,255,255,.76); }.info,.calc,.rules { background:#fff; padding:24rpx; margin-top:20rpx; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); }.info-row,.calc-row { display:flex; justify-content:space-between; padding:12rpx 0; font-size:26rpx; }.lbl { color:#86909c; }.val { font-weight:600; }.val.accent { color:#00A88A; font-size:30rpx; }.calc-title,.title { display:block; font-size:28rpx; font-weight:600; margin-bottom:16rpx; }.desc { font-size:24rpx; color:#4e5969; line-height:1.6; display:block; }.warn { display:block; margin-top:16rpx; font-size:22rpx; color:#ff7d00; }.bottom-bar { position:fixed; bottom:0; left:0; right:0; background:#fff; border-top:1rpx solid var(--yb-border); padding:16rpx 24rpx; padding-bottom:calc(16rpx + env(safe-area-inset-bottom)); }</style>
