<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onHide, onLoad, onShow } from '@dcloudio/uni-app';
import { uploadReviewImage } from '@/service/api/review';
import { go, useNavigationGuards } from '@/utils/navigate';
import ReviewStars from '@/components/common/review-stars.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { usePageOperation } from '@/utils/page-operation';
import { getAccessToken } from '@/service/request/token';
import { newReviewScan, readReviewCreateReceipts, reconcileReviewCreation, reviewCreateMessage, scanReviewableOrder, submitReviewWithReceipt, type ReviewCreateReceipt } from '@/utils/review-create';

const { requireLogin } = useNavigationGuards();
const userStore = useUserStore();
const order = ref<Api.RealReview.ReviewableOrderVO>();
const submitting = ref(false);
const uploading = ref(false);
const orderId = ref('');
const loading = ref(true);
const loadFailed = ref(false);
const receiptFailed = ref(false);
const receipt = ref<ReviewCreateReceipt>();
const qualification = ref(newReviewScan<Api.RealReview.ReviewableOrderVO>());
const recovery = ref(newReviewScan<Api.RealReview.ReviewDTO>());
const form = reactive<{ score: 1 | 2 | 3 | 4 | 5; content: string; photoUrls: string[] }>({ score: 5, content: '', photoUrls: [] });
let loadSequence = 0;
const page = usePageOperation(() => {
  loadSequence++;
  order.value = undefined;
  submitting.value = false;
  uploading.value = false;
  receipt.value = undefined;
  receiptFailed.value = false;
  qualification.value = newReviewScan();
  recovery.value = newReviewScan();
  loading.value = false;
  loadFailed.value = true;
  Object.assign(form, { score: 5, content: '', photoUrls: [] });
});
const formDisabled = computed(() => !page.visible.value || !userStore.currentUser || !userStore.realUserId
  || loading.value || loadFailed.value || receiptFailed.value || !!receipt.value || !order.value || uploading.value || submitting.value);

onLoad(query => { orderId.value = String(query?.orderId || ''); });
function refreshReceipt() {
  try {
    receipt.value = userStore.realUserId ? readReviewCreateReceipts(userStore.realUserId).find(r => String(r.request.orderId) === orderId.value) : undefined;
    receiptFailed.value = false;
  } catch { receiptFailed.value = true; }
}
async function load(reset = true) {
  if (!page.visible.value || uploading.value || submitting.value || loading.value && !reset) return;
  if (!orderId.value) { loading.value = false; return; }
  const operation = page.capture(), sequence = ++loadSequence;
  const valid = () => operation.isCurrent() && sequence === loadSequence;
  if (reset) { qualification.value = newReviewScan(); recovery.value = newReviewScan(); order.value = undefined; }
  const qualificationScan = qualification.value, recoveryScan = recovery.value;
  loading.value = true;
  loadFailed.value = false;
  try {
    await userStore.init();
    if (!valid()) return;
    if (!userStore.currentUser || !userStore.realUserId) {
      if (getAccessToken()) throw new Error('账户资料加载失败，请重试');
      return;
    }
    refreshReceipt();
    if (receiptFailed.value) return;
    if (receipt.value) {
      await reconcileReviewCreation(orderId.value, recoveryScan, valid);
      if (valid()) refreshReceipt();
      if (receipt.value?.state === 'verified') {
        operation.schedule(viewReviews, 0);
        return;
      }
    } else {
      await scanReviewableOrder(orderId.value, qualificationScan, valid);
      if (!valid()) return;
      if (qualificationScan.matches.length > 1) throw new Error('订单评价资格重复，请重新查询');
      order.value = qualificationScan.matches[0];
    }
  } catch (error) {
    if (valid()) {
      loadFailed.value = true;
      uni.showToast({ title: error instanceof Error ? error.message : '评价信息读取失败', icon: 'none' });
    }
  } finally { if (operation.sameSession() && sequence === loadSequence) loading.value = false; }
}
onShow(() => load());
onHide(() => { loadSequence++; loading.value = false; });
async function login() {
  const operation = page.capture();
  if (await requireLogin('/pages/review/write?orderId=' + encodeURIComponent(orderId.value)) && operation.isCurrent()) await load();
}
function viewReviews() { if (page.visible.value && !submitting.value) go(`/pages/review/list${receipt.value ? '?tab=sent' : ''}`, true); }

async function addPhoto() {
  const count = 9 - form.photoUrls.length;
  if (formDisabled.value || count <= 0) return;
  const operation = page.capture();
  uploading.value = true;
  try {
    const picked = await uni.chooseImage({ count, sizeType: ['compressed'] });
    if (!operation.afterPicker()) return;
    const paths = Array.isArray(picked.tempFilePaths) ? picked.tempFilePaths : [picked.tempFilePaths];
    for (const filePath of paths.slice(0, count)) {
      if (!operation.isCurrent()) return;
      const uploaded = await uploadReviewImage(filePath);
      if (!operation.isCurrent()) return;
      if (!uploaded.url || uploaded.privateAccess === true || (uploaded.scene != null && uploaded.scene !== 'REVIEW')
        || !/^https?:\/\/[^/?#]+\/[^?#]+$/i.test(uploaded.url)) throw new Error('上传响应不是有效的评价公开图片');
      form.photoUrls.push(uploaded.url);
    }
  } catch (error) {
    if (!operation.isCurrent()) return;
    const message = error instanceof Error ? error.message : String((error as { errMsg?: string })?.errMsg || '评价图片上传失败');
    if (!message.includes('cancel')) uni.showToast({ title: message, icon: 'none' });
  } finally { if (operation.sameSession()) uploading.value = false; }
}
function removePhoto(index: number) { if (!formDisabled.value) form.photoUrls.splice(index, 1); }

async function submit(retryOriginal = false) {
  if (!page.visible.value || loading.value || uploading.value || submitting.value || receiptFailed.value || !userStore.realUserId) return;
  if (retryOriginal ? receipt.value?.state !== 'unknown' : formDisabled.value) return;
  const original = retryOriginal ? receipt.value : undefined;
  const request = original ? original.request : { orderId: order.value!.orderId, productScore: form.score, sellerScore: form.score, content: form.content.trim(), images: [...form.photoUrls], anonymous: false };
  const operation = page.capture();
  submitting.value = true;
  let submitted: ReviewCreateReceipt | undefined;
  try {
    submitted = await submitReviewWithReceipt(request, order.value, qualification.value.matchPage, operation.isCurrent, original?.attempt);
    if (!operation.sameSession()) return;
    refreshReceipt();
    if (submitted && operation.isCurrent()) uni.showToast({ title: reviewCreateMessage(submitted), icon: 'none' });
  } catch (error) {
    if (operation.sameSession()) refreshReceipt();
    if (operation.isCurrent()) uni.showToast({ title: receipt.value ? reviewCreateMessage(receipt.value) : error instanceof Error ? error.message : '评价提交失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) {
      submitting.value = false;
      if (page.visible.value) await load();
      if (submitted && operation.isCurrent() && !loadFailed.value && !receiptFailed.value && receipt.value?.state === 'verified'
        && receipt.value.attempt === submitted.attempt) operation.schedule(viewReviews, 700);
    }
  }
}
</script>

<template>
  <view class="review-write yb-page">
    <view v-if="receipt && receipt.state !== 'verified'" class="order-card receipt-panel">
      <text>{{ reviewCreateMessage(receipt) }}</text>
      <text>原订单：{{ receipt.request.orderId }}</text>
      <text>原评分：{{ receipt.request.productScore }} · {{ receipt.request.content || '未填写文字' }}</text>
      <wd-button block plain :loading="loading" :disabled="submitting" @click="load(false)">{{ !recovery.done && recovery.nextPage > 1 ? '继续核对原评价' : '核对原评价' }}</wd-button>
      <wd-button v-if="receipt.state === 'unknown'" block plain :loading="submitting" :disabled="loading || uploading || receiptFailed" @click="submit(true)">按原内容重试</wd-button>
      <wd-button block plain :disabled="submitting" @click="viewReviews">查看评价记录</wd-button>
    </view>
    <wd-button v-if="receiptFailed" block plain :disabled="submitting" @click="load()">本机评价记录读取失败，已暂停提交，点击重试</wd-button>
    <view v-if="loading" class="loading"><wd-loading size="44rpx" /><text>正在核对评价信息</text></view>
    <EmptyState v-else-if="!orderId" title="缺少订单信息" action-text="返回评价列表" @action="viewReviews" />
    <EmptyState v-else-if="!userStore.currentUser && !loadFailed" title="请先登录查看评价资格" action-text="登录或重试" @action="login" />
    <view v-else-if="loadFailed" class="order-card">
      <text>评价信息读取失败，未解除原提交保护。</text>
      <wd-button block plain @click="load(false)">从失败页重试</wd-button>
      <wd-button block plain @click="load()">重新查询</wd-button>
    </view>
    <template v-else-if="!receipt && !receiptFailed">
      <template v-if="order">
        <view class="order-card"><text class="ord-code">订单 {{ order.orderNo || order.orderId }}</text><text class="ord-target">评价对象：{{ order.sellerName || '买手' }}</text></view>
        <view class="step"><text class="step-title">评分</text><view class="stars-row"><ReviewStars v-model:score="form.score" :mode="formDisabled ? 'readonly' : 'input'" size="lg" /><text class="score-text">{{ form.score }}.0</text></view></view>
        <view class="step"><text class="step-title">评价内容（可选）</text><wd-textarea v-model="form.content" :disabled="formDisabled" placeholder="分享本次购物体验" :max-length="1000" show-word-limit /></view>
        <view class="step"><text class="step-title">配图（可选，最多 9 张）</text><view class="img-grid"><view v-for="(url, index) in form.photoUrls" :key="url + index" class="img-cell"><image :src="url" mode="aspectFill" class="img" /><view class="del" @click="removePhoto(index)"><wd-icon name="close" size="12px" color="#fff" /></view></view><view v-if="form.photoUrls.length < 9" class="add" @click="addPhoto"><wd-icon name="add" size="18px" /><text>添加</text></view></view></view>
        <wd-button type="primary" block class="submit" :loading="submitting" :disabled="formDisabled" @click="submit()">{{ uploading ? '图片上传中' : '提交评价' }}</wd-button>
      </template>
      <view v-else-if="!qualification.done" class="order-card">
        <text>已查询 {{ qualification.nextPage - 1 }} 页，尚未完成资格查询。</text>
        <wd-button block plain @click="load(false)">继续查询</wd-button>
      </view>
      <EmptyState v-else title="当前订单暂不可评价" description="仅支持已完成且仍在评价时限内、未评价过的订单；删除评价后不能重评。" action-text="重新查询" @action="load()" />
    </template>
  </view>
</template>
<style lang="scss" scoped>
.receipt-panel { display:flex; flex-direction:column; gap:16rpx; background:#fff6e8; color:#83510b; }
.review-write { min-height: 100%; padding:20rpx 24rpx 32rpx; }.order-card,.step { background:#fff; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); padding:24rpx; margin-bottom:20rpx; box-shadow:var(--yb-shadow-card); }.ord-code { display:block; font-family:ui-monospace,monospace; font-size:24rpx; color:#86909c; }.ord-target { display:block; font-size:28rpx; font-weight:600; margin-top:8rpx; }.step-title { display:block; font-size:26rpx; font-weight:600; margin-bottom:16rpx; }.stars-row { display:flex; align-items:center; gap:16rpx; }.score-text { font-size:36rpx; font-weight:700; color:#c88a06; font-family:ui-monospace,monospace; }.img-grid { display:flex; flex-wrap:wrap; gap:12rpx; }.img-cell { position:relative; width:160rpx; height:160rpx; }.img { width:100%; height:100%; border-radius:12rpx; }.del { position:absolute; top:4rpx; right:4rpx; background:rgba(0,0,0,.55); color:#fff; width:32rpx; height:32rpx; border-radius:50%; display:flex; align-items:center; justify-content:center; }.add { width:160rpx; height:160rpx; background:#f5f5f2; border:2rpx dashed #b9bdc7; border-radius:12rpx; display:flex; flex-direction:column; gap:6rpx; align-items:center; justify-content:center; color:var(--yb-brand); font-size:22rpx; }.submit { margin-top:16rpx; }
.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }
</style>
