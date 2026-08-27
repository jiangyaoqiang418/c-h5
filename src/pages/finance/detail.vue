<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchFinanceProductDetail, subscribeFinance } from '@/service/api/finance';
import { formatAmount, formatRate } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';
import EmptyState from '@/components/common/empty-state.vue';
import { useWalletStore } from '@/stores';
import { UI_ASSETS } from '@/constants/ui-assets';

const walletStore = useWalletStore();
const product = ref<Api.RealFinance.ProductVO>(); const amount = ref(''); const submitting = ref(false);
async function load(id: string) {
  try {
    product.value = await fetchFinanceProductDetail(id);
    amount.value = String(product.value.minAmount);
    await walletStore.refetch();
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '理财产品加载失败', icon: 'none' });
  }
}
onLoad(query => { const id = String(query?.id || ''); if (id) load(id); });
const available = computed(() => Number(walletStore.account?.available || 0));
const expectedInterest = computed(() => product.value ? Number(amount.value || 0) * Number(product.value.annualRate || 0) * product.value.lockDays / 365 : 0);
const canSubmit = computed(() => !!product.value && Number(amount.value) >= Number(product.value.minAmount) && (!product.value.maxAmount || Number(amount.value) <= Number(product.value.maxAmount)) && Number(amount.value) <= available.value && product.value.status === 'ON_SALE');
function subscribe() {
  if (!product.value || !canSubmit.value || submitting.value) return;
  uni.showModal({
    title: '确认申购',
    content: `确认使用 U ${amount.value} 申购“${product.value.name}”吗？资金将锁定 ${product.value.lockDays} 天，实际收益以后端结算结果为准。`,
    confirmText: '确认申购',
    success: async result => {
      if (!result.confirm || !product.value || submitting.value) return;
      submitting.value = true;
      try {
        await subscribeFinance({ productId: product.value.id, amount: amount.value });
        await walletStore.refetch();
        uni.showToast({ title: '申购成功', icon: 'success' });
        setTimeout(() => go('/pages/finance/my-lockups'), 600);
      } catch (error) {
        uni.showToast({ title: error instanceof Error ? error.message : '申购失败', icon: 'none' });
      } finally {
        submitting.value = false;
      }
    }
  });
}
</script>

<template>
  <view v-if="product" class="detail-page yb-page"><view class="hero" :style="{ backgroundImage: `url(${UI_ASSETS.backgrounds.finance})` }"><text class="name">{{ product.name }}</text><text class="rate">{{ formatRate(Number(product.annualRate)) }}</text><text class="rate-meta">年化收益率 · 锁仓 {{ product.lockDays }} 天</text></view><view class="info"><view class="info-row"><text class="lbl">起投</text><text>U {{ formatAmount(product.minAmount) }}</text></view><view v-if="product.maxAmount" class="info-row"><text class="lbl">单笔上限</text><text>U {{ formatAmount(product.maxAmount) }}</text></view><view class="info-row"><text class="lbl">可用余额</text><text>U {{ formatAmount(available) }}</text></view></view><view class="calc"><text class="calc-title">申购金额</text><wd-input v-model="amount" label="投入金额" type="digit" placeholder="USDT" /><view class="calc-row"><text class="lbl">预计到期收益</text><text class="val accent">U {{ formatAmount(expectedInterest) }}</text></view></view><view class="rules"><text class="title">产品说明</text><text class="desc">{{ product.description || '以订单快照及后端实际结算结果为准。' }}</text><text v-if="product.earlyRedeemEnabled" class="warn">提前赎回可用性与可得收益以订单详情返回值为准。</text></view><view class="bottom-bar"><wd-button type="primary" block :disabled="!canSubmit" :loading="submitting" @click="subscribe">立即申购 U {{ amount }}</wd-button></view></view><EmptyState v-else title="小金库产品不存在" />
</template>

<style lang="scss" scoped>.detail-page { min-height:100%; padding:24rpx 24rpx 200rpx; }.hero { background-color:#432e12; background-size:cover; background-position:center; color:#fff; padding:56rpx 32rpx; text-align:center; border-radius:var(--yb-radius-lg); }.name { display:block; font-size:32rpx; font-weight:600; color:rgba(255,255,255,.74); }.rate { display:block; font-size:96rpx; font-weight:700; font-family:ui-monospace,monospace; color:#fff; margin:16rpx 0 8rpx; }.rate-meta { font-size:22rpx; color:rgba(255,255,255,.76); }.info,.calc,.rules { background:#fff; padding:24rpx; margin-top:20rpx; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card); }.info-row,.calc-row { display:flex; justify-content:space-between; padding:12rpx 0; font-size:26rpx; }.lbl { color:#86909c; }.val { font-weight:600; }.val.accent { color:#00A88A; font-size:30rpx; }.calc-title,.title { display:block; font-size:28rpx; font-weight:600; margin-bottom:16rpx; }.desc { font-size:24rpx; color:#4e5969; line-height:1.6; display:block; }.warn { display:block; margin-top:16rpx; font-size:22rpx; color:#ff7d00; }.bottom-bar { position:fixed; bottom:0; left:0; right:0; background:#fff; border-top:1rpx solid var(--yb-border); padding:16rpx 24rpx; padding-bottom:calc(16rpx + env(safe-area-inset-bottom)); }</style>
