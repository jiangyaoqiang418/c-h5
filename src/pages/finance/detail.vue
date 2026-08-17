<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { fetchFinanceProductDetail, subscribeFinance } from '@/service/api/finance';
import { formatAmount, formatRate } from '@/utils/format-bridge';
import { go } from '@/utils/navigate';
import EmptyState from '@/components/common/empty-state.vue';
import { useWalletStore } from '@/stores';

const walletStore = useWalletStore();
const product = ref<Api.RealFinance.ProductVO>(); const amount = ref(''); const submitting = ref(false);
onLoad(async query => { const id = String(query?.id || ''); if (!id) return; product.value = await fetchFinanceProductDetail(id); amount.value = String(product.value.minAmount); await walletStore.refetch(); });
const available = computed(() => Number(walletStore.account?.available || 0));
const expectedInterest = computed(() => product.value ? Number(amount.value || 0) * Number(product.value.annualRate || 0) * product.value.lockDays / 365 : 0);
const canSubmit = computed(() => !!product.value && Number(amount.value) >= Number(product.value.minAmount) && (!product.value.maxAmount || Number(amount.value) <= Number(product.value.maxAmount)) && Number(amount.value) <= available.value && product.value.status === 'ON_SALE');
async function subscribe() { if (!product.value) return; submitting.value = true; try { await subscribeFinance({ productId: product.value.id, amount: amount.value }); uni.showToast({ title: '申购成功', icon: 'success' }); setTimeout(() => go('/pages/finance/my-lockups'), 600); } finally { submitting.value = false; } }
</script>

<template>
  <view v-if="product" class="detail-page"><view class="hero"><text class="name">{{ product.name }}</text><text class="rate">{{ formatRate(Number(product.annualRate)) }}</text><text class="rate-meta">年化收益率 · 锁仓 {{ product.lockDays }} 天</text></view><view class="info"><view class="info-row"><text class="lbl">起投</text><text>U {{ formatAmount(product.minAmount) }}</text></view><view v-if="product.maxAmount" class="info-row"><text class="lbl">单笔上限</text><text>U {{ formatAmount(product.maxAmount) }}</text></view><view class="info-row"><text class="lbl">可用余额</text><text>U {{ formatAmount(available) }}</text></view></view><view class="calc"><text class="calc-title">申购金额</text><wd-input v-model="amount" label="投入金额" type="digit" placeholder="USDT" /><view class="calc-row"><text class="lbl">预计到期收益</text><text class="val accent">U {{ formatAmount(expectedInterest) }}</text></view></view><view class="rules"><text class="title">产品说明</text><text class="desc">{{ product.description || '以订单快照及后端实际结算结果为准。' }}</text><text v-if="product.earlyRedeemEnabled" class="warn">提前赎回可用性与可得收益以订单详情返回值为准。</text></view><view class="bottom-bar"><wd-button type="primary" block :disabled="!canSubmit" :loading="submitting" @click="subscribe">立即申购 U {{ amount }}</wd-button></view></view><EmptyState v-else title="小金库产品不存在" />
</template>

<style lang="scss" scoped>.detail-page { min-height:100%; background:#FAFAF7; padding-bottom:200rpx; }.hero { background:#fff; border-bottom:1rpx solid #EDECE6; color:#0F111A; padding:56rpx 32rpx; text-align:center; }.name { display:block; font-size:32rpx; font-weight:600; color:#86909C; }.rate { display:block; font-size:96rpx; font-weight:700; font-family:ui-monospace,monospace; color:#00A88A; margin:16rpx 0 8rpx; }.rate-meta { font-size:22rpx; color:#86909C; }.info,.calc,.rules { background:#fff; padding:24rpx 32rpx; margin-top:16rpx; }.info-row,.calc-row { display:flex; justify-content:space-between; padding:12rpx 0; font-size:26rpx; }.lbl { color:#86909c; }.val { font-weight:600; }.val.accent { color:#00A88A; font-size:30rpx; }.calc-title,.title { display:block; font-size:28rpx; font-weight:600; margin-bottom:16rpx; }.desc { font-size:24rpx; color:#4e5969; line-height:1.6; display:block; }.warn { display:block; margin-top:16rpx; font-size:22rpx; color:#ff7d00; }.bottom-bar { position:fixed; bottom:0; left:0; right:0; background:#fff; border-top:1rpx solid #f2f3f5; padding:16rpx 24rpx; padding-bottom:calc(16rpx + env(safe-area-inset-bottom)); }</style>
