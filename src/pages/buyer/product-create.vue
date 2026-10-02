<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import { fetchCategoryTree, enabledThirdLevelCategories, type CategoryNode } from '@/service/api/category';
import { uploadProductImage } from '@/service/api/product';
import { fetchBuyerDepositSummary } from '@/service/api/buyer';
import { go, useNavigationGuards } from '@/utils/navigate';
import { useUserStore } from '@/stores';
import { usePageOperation } from '@/utils/page-operation';
import { getAccessToken } from '@/service/request/token';
import { beginNextProduct, createProductWithReceipt, productCreateMessage, readProductCreateReceipt, reconcileProductCreation, type ProductCreateReceipt } from '@/utils/product-create';
import EmptyState from '@/components/common/empty-state.vue';
import CategoryPicker from '@/components/common/category-picker.vue';
import RichTextEditor from '@/components/common/rich-text-editor.vue';
import { richTextError, sanitizeRichText } from '@/utils/rich-text';

const { requireLogin } = useNavigationGuards();

interface CategoryOption {
  id: string;
  name: string;
}

const userStore = useUserStore();
const step = ref(0);
const submitting = ref(false);
const uploading = ref(false);
const submitted = ref(false);
const submittedId = ref<string | number>();
const receipt = ref<ProductCreateReceipt>();
const receiptFailed = ref(false);
const categories = ref<CategoryOption[]>([]);
const categoryTree = ref<CategoryNode[]>([]);
const categoryPickerOpen = ref(false);
const categoryLoading = ref(false);
const categoryError = ref('');
const categoryHelpOpen = ref(false);
let categorySequence = 0;
const loading = ref(true);
const loadFailed = ref(false);
const formInitialized = ref(false);
let loadSequence = 0;

const form = reactive({
  title: '',
  brief: '',
  description: '',
  categoryId: '',
  price: '99',
  shippingFee: '0',
  taxFee: '0',
  stock: 10,
  afterSaleType: 'SEVEN_DAY_NO_REASON' as Api.RealProduct.AfterSaleType,
  overseasClearance: false,
  images: [] as Api.RealProduct.FileUploadResult[]
});
const page = usePageOperation(() => {
  loadSequence++;
  categorySequence++; categoryLoading.value = false; categoryError.value = '';
  categoryHelpOpen.value = false;
  loading.value = false;
  loadFailed.value = true;
  formInitialized.value = false;
  step.value = 0;
  submitting.value = false;
  uploading.value = false;
  submitted.value = false;
  submittedId.value = undefined;
  receipt.value = undefined;
  receiptFailed.value = false;
  categories.value = [];
  categoryTree.value = [];
  categoryPickerOpen.value = false;
  Object.assign(form, { title: '', brief: '', description: '', categoryId: '', price: '99', shippingFee: '0', taxFee: '0', stock: 10, afterSaleType: 'SEVEN_DAY_NO_REASON', overseasClearance: false, images: [] });
});
const canPublish = computed(() => page.visible.value && !loading.value && !loadFailed.value && !categoryLoading.value && !categoryError.value && !receiptFailed.value && !receipt.value && userStore.canSwitchToBuyer);

const categoryName = computed(() => categories.value.find(item => item.id === form.categoryId)?.name || '请选择');

async function load() {
  if (!page.visible.value || uploading.value || submitting.value) return;
  const operation = page.capture();
  const sequence = ++loadSequence;
  const valid = () => operation.isCurrent() && sequence === loadSequence;
  loading.value = true;
  loadFailed.value = false;
  try {
    await userStore.init();
    if (!valid()) return;
    if (!userStore.currentUser) {
      if (getAccessToken()) throw new Error('账户资料加载失败，请重试');
      await requireLogin('/pages/buyer/product-create');
      return;
    }
    refreshReceipt();
    if (receiptFailed.value) return;
    if (receipt.value) {
      await reconcileProductCreation(userStore.realUserId!, valid);
      if (valid()) refreshReceipt();
      if (!receipt.value || receipt.value.state !== 'verified') return;
      beginNextProduct(userStore.realUserId!, receipt.value.attempt);
      refreshReceipt();
    }
    await userStore.refreshProfile();
    if (!valid() || !userStore.canSwitchToBuyer) return;
    await refreshCategories(valid);
  } catch (error) {
    if (!valid()) return;
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '发布资格或分类加载失败', icon: 'none' });
  } finally {
    if (operation.sameSession() && sequence === loadSequence) {
      loading.value = false;
      if (!loadFailed.value && userStore.currentUser && userStore.canSwitchToBuyer && !receipt.value && !receiptFailed.value) formInitialized.value = true;
    }
  }
}
async function refreshCategories(parentCurrent: () => boolean = () => true) {
  if (!page.visible.value || submitting.value || uploading.value || !userStore.canSwitchToBuyer) return;
  const operation = page.capture(), sequence = ++categorySequence;
  const current = () => operation.isCurrent() && sequence === categorySequence && parentCurrent();
  categoryLoading.value = true; categoryError.value = ''; categoryPickerOpen.value = false;
  try {
    const tree = await fetchCategoryTree({ onlyEnabled: true, onlyWithProduct: false });
    if (!current()) return;
    categoryTree.value = tree; categories.value = enabledThirdLevelCategories(tree);
    if (form.categoryId && !categories.value.some(item => item.id === form.categoryId)) {
      form.categoryId = ''; uni.showToast({ title: '原分类已不可用，请重新选择', icon: 'none' });
    }
  } catch (error) {
    if (current()) categoryError.value = error instanceof Error ? error.message : '分类读取失败，请刷新重试';
  } finally { if (sequence === categorySequence) categoryLoading.value = false; }
}
onShow(load);
onHide(() => { loadSequence++; categorySequence++; loading.value = false; categoryLoading.value = false; categoryPickerOpen.value = false; });

function refreshReceipt() {
  try {
    receipt.value = userStore.realUserId ? readProductCreateReceipt(userStore.realUserId) : undefined;
    submitted.value = !!receipt.value;
    submittedId.value = receipt.value?.state === 'verified' ? receipt.value.productId : undefined;
    receiptFailed.value = false;
  } catch { receiptFailed.value = true; }
}

async function startNext() {
  if (!page.visible.value || loading.value || submitting.value || uploading.value || receiptFailed.value || receipt.value?.state !== 'verified' || !userStore.realUserId) return;
  try {
    beginNextProduct(userStore.realUserId, receipt.value.attempt);
    refreshReceipt();
    step.value = 0;
    Object.assign(form, { title: '', brief: '', description: '', categoryId: '', price: '99', shippingFee: '0', taxFee: '0', stock: 10, afterSaleType: 'SEVEN_DAY_NO_REASON', overseasClearance: false, images: [] });
    await load();
  } catch (error) {
    refreshReceipt();
    uni.showToast({ title: error instanceof Error ? error.message : '请先核对原商品', icon: 'none' });
  }
}

function viewOriginalProduct() {
  if (!page.visible.value || submitting.value || receiptFailed.value || receipt.value?.state !== 'verified' || submittedId.value == null || !userStore.realUserId) return;
  const productId = submittedId.value;
  beginNextProduct(userStore.realUserId, receipt.value.attempt);
  refreshReceipt();
  go(`/pages/buyer/product-detail?id=${encodeURIComponent(String(productId))}`, true);
}

function pickCategory() {
  if (!page.visible.value || !canPublish.value || submitting.value || uploading.value || submitted.value || !categories.value.length) return;
  categoryPickerOpen.value = true;
}

function selectCategory(item: CategoryOption) { form.categoryId = item.id; }

async function chooseImages() {
  const count = 6 - form.images.length;
  if (!page.visible.value || !canPublish.value || count <= 0 || uploading.value || submitting.value || submitted.value) return;
  const operation = page.capture();
  uploading.value = true;
  try {
    const result = await uni.chooseImage({ count, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
    if (!operation.afterPicker()) return;
    const filePaths = Array.isArray(result.tempFilePaths) ? result.tempFilePaths : [result.tempFilePaths];
    for (let index = 0; index < Math.min(filePaths.length, count); index += 1) {
      if (!operation.isCurrent()) return;
      const file = await uploadProductImage(filePaths[index]);
      if (!operation.isCurrent()) return;
      form.images.push(file);
    }
  } catch (error) {
    if (!operation.isCurrent()) return;
    const message = error instanceof Error ? error.message : String((error as { errMsg?: string })?.errMsg || '图片上传失败');
    if (!message.includes('cancel')) uni.showToast({ title: message, icon: 'none' });
  } finally {
    if (operation.sameSession()) uploading.value = false;
  }
}

function removeImage(index: number) {
  if (!canPublish.value || uploading.value || submitting.value || submitted.value) return;
  form.images.splice(index, 1);
}

function canNext(): boolean {
  if (step.value === 0) return form.title.trim().length > 0 && categories.value.some(item => item.id === form.categoryId) && form.brief.trim().length > 0;
  if (step.value === 1) {
    return [form.price, form.shippingFee, form.taxFee].every(value => Number.isFinite(Number(value)))
      && Number.isSafeInteger(Number(form.stock)) && Number(form.price) > 0
      && Number(form.shippingFee) >= 0
      && Number(form.taxFee) >= 0
      && Number(form.stock) >= 0;
  }
  if (step.value === 2) return form.images.length >= 1;
  return true;
}
const navigationHint = computed(() => {
  if (submitting.value) return '正在提交商品，请稍候。';
  if (uploading.value) return '图片正在上传，完成后可继续。';
  if (step.value >= 3 || canNext()) return '';
  if (step.value === 0) {
    const missing = [];
    if (!form.title.trim()) missing.push('商品标题');
    if (!categories.value.some(item => item.id === form.categoryId)) missing.push('有效分类');
    if (!form.brief.trim()) missing.push('商品简介');
    return `请补充${missing.join('、')}后继续。`;
  }
  if (step.value === 1) {
    const corrections = [];
    if (!Number.isFinite(Number(form.price)) || Number(form.price) <= 0) corrections.push('售价须大于 0');
    if (!Number.isFinite(Number(form.shippingFee)) || Number(form.shippingFee) < 0) corrections.push('运费须为 0 或正数');
    if (!Number.isFinite(Number(form.taxFee)) || Number(form.taxFee) < 0) corrections.push('税费须为 0 或正数');
    if (!Number.isSafeInteger(Number(form.stock)) || Number(form.stock) < 0) corrections.push('库存须为 0 或正整数');
    return `${corrections.join('；')}。`;
  }
  return '至少添加 1 张商品图片后继续。';
});

async function submit() {
  if (!page.visible.value || !canPublish.value || submitting.value || uploading.value || submitted.value) return;
  if (!form.title.trim() || !categories.value.some(item => item.id === form.categoryId) || !form.brief.trim() || !form.images.length
    || ![form.price, form.shippingFee, form.taxFee].every(value => Number.isFinite(Number(value)))
    || Number(form.price) <= 0 || Number(form.shippingFee) < 0 || Number(form.taxFee) < 0
    || !Number.isSafeInteger(Number(form.stock)) || Number(form.stock) < 0) {
    uni.showToast({ title: '请核对商品信息、金额、整数库存和图片', icon: 'none' });
    return;
  }
  const descriptionError = richTextError(form.description);
  if (descriptionError) return uni.showToast({ title: descriptionError, icon: 'none' });
  submitting.value = true;
  const operation = page.capture();
  let created: ProductCreateReceipt | undefined;
  try {
    const depositSummary = await fetchBuyerDepositSummary();
    if (!operation.isCurrent()) return;
    if (!depositSummary.listable) {
      uni.showToast({ title: '当前保证金不足，请先处理保证金', icon: 'none' });
      go('/pages/buyer/deposit');
      return;
    }
    created = await createProductWithReceipt({
      title: form.title.trim(),
      categoryId: form.categoryId,
      price: Number(form.price),
      shippingFee: Number(form.shippingFee),
      taxFee: Number(form.taxFee),
      stock: Number(form.stock),
      afterSaleType: form.afterSaleType,
      overseasClearance: form.overseasClearance,
      brief: form.brief.trim(),
      description: sanitizeRichText(form.description) || form.brief.trim(),
      images: form.images.map(image => ({ bucket: image.bucket, filePath: image.filePath }))
    }, [...form.images], operation.isCurrent);
    if (!operation.sameSession()) return;
    refreshReceipt();
    if (created && operation.isCurrent()) uni.showToast({ title: productCreateMessage(created), icon: 'none' });
  } catch (error) {
    if (operation.sameSession()) refreshReceipt();
    if (operation.isCurrent()) uni.showToast({ title: receipt.value ? productCreateMessage(receipt.value) : error instanceof Error ? error.message : '商品提交失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) {
      submitting.value = false;
      if (page.visible.value) await load();
      if (created && operation.isCurrent() && !loadFailed.value && !receiptFailed.value && receipt.value?.state === 'verified'
        && receipt.value.attempt === created.attempt) operation.schedule(viewOriginalProduct, 700);
    }
  }
}
</script>

<template>
  <view class="publish-page">
  <view v-if="receipt && receipt.state !== 'verified'" class="receipt-panel">
    <text>{{ productCreateMessage(receipt) }}</text>
    <text>原商品：{{ receipt.request.title }}</text>
    <wd-button block plain :loading="loading" :disabled="submitting || uploading" @click="load">核对原商品</wd-button>
    <wd-button v-if="submittedId != null" block type="primary" :disabled="submitting || receiptFailed" @click="viewOriginalProduct">查看提交结果</wd-button>
  </view>
  <wd-button v-if="receiptFailed" block plain :disabled="submitting" @click="load">发布记录读取失败，点击核对</wd-button>
  <view v-if="loading" class="create-page yb-page"><wd-loading size="44rpx" /><text>正在确认发布资格和商品分类</text></view>
  <EmptyState v-else-if="loadFailed" title="发布信息加载失败" description="请重新加载后继续填写" action-text="重新加载" @action="load" />
  <EmptyState v-else-if="!userStore.currentUser" title="请先登录发布商品" action-text="登录或重试" @action="load" />
  <template v-else-if="receipt || receiptFailed" />
  <view v-else-if="!userStore.canSwitchToBuyer" class="create-page yb-page">
    <EmptyState title="暂不具备商品发布资格" description="请先完成买手资格和实名认证" :action-text="userStore.currentUser?.isBuyer ? '前往实名认证' : '前往买手申请'" @action="go(userStore.currentUser?.isBuyer ? '/pages/kyc/index' : '/pages/buyer/apply')" />
    <wd-button block plain @click="load">刷新资格</wd-button>
  </view>
  <!-- 已授权表单保持实例，避免页面激活时加载状态销毁 textarea 的 ResizeSensor。 -->
  <view v-if="formInitialized && userStore.currentUser && userStore.canSwitchToBuyer && !receipt && !receiptFailed" v-show="!loading && !loadFailed" class="create-page yb-page">
    <wd-steps :active="step" align-center>
      <wd-step title="基本信息" />
      <wd-step title="价格库存" />
      <wd-step title="商品图片" />
      <wd-step title="确认提交" />
    </wd-steps>

    <view class="content">
      <view v-show="step === 0" class="form">
        <view class="text-field"><text class="field-label">商品标题 <text class="required-note">必填</text></text><wd-input v-model="form.title" placeholder="写清品牌、商品名称与主要规格" :maxlength="128" /></view>
        <wd-cell title="分类" :value="categories.length ? categoryName : '暂不可选'" :is-link="!!categories.length" @click="pickCategory" />
        <view v-if="categoryError || !categories.length || categoryHelpOpen" class="category-hint"><text>{{ categoryError || (categories.length ? '已申请的分类通过后，可刷新列表重新选择。' : '分类暂不可用，请刷新后选择') }}</text><wd-button plain size="small" :loading="categoryLoading" :disabled="loading || submitting || uploading" @click="refreshCategories()">刷新分类</wd-button></view>
        <view v-else class="category-help" @click="categoryHelpOpen = true">找不到已申请的分类？</view>
        <view class="text-field"><text class="field-label">商品简介 <text class="required-note">必填</text></text><wd-textarea auto-height v-model="form.brief" placeholder="30 字以内，简要介绍商品特点" :maxlength="30" show-word-limit /></view>
        <view class="field-label">图文详情 <text class="optional-note">选填</text></view>
        <text class="field-help">补充规格、材质与使用说明；未填写时沿用商品简介。</text>
        <RichTextEditor v-model="form.description" :disabled="submitting" @uploading="uploading = $event" />
      </view>

      <view v-show="step === 1" class="form">
        <wd-input v-model="form.price" label="售价 (USDT)" type="digit" />
        <wd-input v-model="form.shippingFee" label="运费 (USDT)" type="digit" />
        <wd-input v-model="form.taxFee" label="税费 (USDT)" type="digit" />
        <wd-input v-model="form.stock" label="库存" type="number" />
        <wd-cell title="售后类型">
          <wd-radio-group v-model="form.afterSaleType" inline>
            <wd-radio value="SEVEN_DAY_NO_REASON">7天</wd-radio>
            <wd-radio value="SHOP_WARRANTY">店保</wd-radio>
            <wd-radio value="NATIONAL_WARRANTY">国保</wd-radio>
            <wd-radio value="NONE">无售后</wd-radio>
          </wd-radio-group>
        </wd-cell>
        <wd-cell title="海外过关（不可退）">
          <wd-switch v-model="form.overseasClearance" />
        </wd-cell>
      </view>

      <view v-show="step === 2" class="form">
        <text class="hint">至少 1 张，最多 6 张</text>
        <view class="image-grid">
          <view v-for="(image, index) in form.images" :key="String(image.id)" class="image-cell">
            <image :src="image.url" mode="aspectFill" class="image" />
            <view class="remove" @click="removeImage(index)"><wd-icon name="close" size="13px" color="#fff" /></view>
          </view>
          <view v-if="form.images.length < 6" class="add" @click="chooseImages"><wd-icon name="add" size="22px" /><text class="upload-caption">{{ uploading ? '上传中' : '添加图片' }}</text></view>
        </view>
      </view>

      <view v-show="step === 3" class="summary">
        <view class="row"><text class="label">标题</text><text>{{ form.title }}</text></view>
        <view class="row"><text class="label">分类</text><text>{{ categoryName }}</text></view>
        <view class="row"><text class="label">售价</text><text>{{ form.price }} USDT</text></view>
        <view class="row"><text class="label">库存</text><text>{{ form.stock }}</text></view>
        <view class="row"><text class="label">图片</text><text>{{ form.images.length }} 张</text></view>
        <text class="submit-tip">提交后商品进入平台审核，审核通过后才可上架销售。</text>
      </view>
    </view>

    <view class="nav-bar">
      <text v-if="navigationHint" class="navigation-hint" aria-live="polite">{{ navigationHint }}</text>
      <view class="nav-actions">
      <wd-button v-if="submittedId != null" type="primary" @click="go(`/pages/buyer/product-detail?id=${encodeURIComponent(String(submittedId))}`, true)">查看提交结果</wd-button>
      <wd-button v-if="step > 0" plain :disabled="submitting || uploading" @click="step--">上一步</wd-button>
      <wd-button v-if="step < 3" type="primary" :disabled="!canNext() || submitting || uploading" @click="step++">下一步</wd-button>
      <wd-button v-else type="primary" :loading="submitting" :disabled="submitted || uploading" @click="submit">{{ submitted ? '已提交' : '提交审核' }}</wd-button>
      </view>
    </view>
  </view>
  <CategoryPicker v-model="categoryPickerOpen" :tree="categoryTree" :selected-id="form.categoryId" @select="selectCategory" />
  </view>
</template>

<style lang="scss" scoped>
.category-hint { padding:12rpx 24rpx; display:flex; align-items:center; justify-content:space-between; gap:12rpx; color:var(--yb-muted); font-size:24rpx; }
.field-label { display:block; padding:20rpx 0 12rpx; color:var(--yb-ink); font-size:26rpx; font-weight:600; }
.required-note, .optional-note { margin-left:8rpx; font-size:24rpx; font-weight:400; color:var(--yb-muted); }
.field-help { display:block; margin-bottom:16rpx; color:var(--yb-muted); font-size:24rpx; line-height:1.6; }
.text-field :deep(.wd-input__inner), .text-field :deep(.wd-textarea__inner) { text-align:left; }
.text-field :deep(.wd-input), .text-field :deep(.wd-textarea) { padding-left:0; padding-right:0; }
.category-help { display:flex; align-items:center; min-height:88rpx; padding:0 24rpx; color:var(--yb-muted); font-size:24rpx; }
.publish-page { min-height:100%; }
.receipt-panel { display:flex; flex-direction:column; gap:16rpx; margin:24rpx; padding:24rpx; background:#fff; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); font-size:26rpx; }
.create-page { min-height:100%; box-sizing:border-box; padding:24rpx 24rpx calc(280rpx + env(safe-area-inset-bottom)); }.content { min-height:400rpx; margin-top:20rpx; padding:24rpx; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); background:#fff; box-shadow:var(--yb-shadow-card); }
.hint { display:block; margin-bottom:16rpx; font-size:24rpx; color:var(--yb-muted); }
.image-grid { display: flex; flex-wrap: wrap; gap: 12rpx; }
.image-cell, .add { width: 200rpx; height: 200rpx; }
.image-cell { position: relative; }
.image { width: 100%; height: 100%; border-radius: 8rpx; }
.remove {
  position:absolute; top:0; right:0; display:flex; align-items:center; justify-content:center;
  width:88rpx; height:88rpx; color:#fff;
}
.remove::before { content:''; position:absolute; width:40rpx; height:40rpx; border-radius:50%; background:rgba(0,0,0,.55); }.remove :deep(.wd-icon) { position:relative; }
.add {
  display: flex; align-items: center; justify-content: center; box-sizing: border-box;
  flex-direction:column; gap:8rpx; border:2rpx dashed #c9cdd4; border-radius:var(--yb-radius-md); background:#f7f8fa; color:#86909c; font-size:20rpx;
}
.summary .row { display: flex; justify-content: space-between; gap: 24rpx; padding: 18rpx 0; border-bottom: 1rpx solid #f2f3f5; font-size: 24rpx; }
.upload-caption { color:var(--yb-muted); font-size:24rpx; }
.label { flex-shrink:0; color:var(--yb-muted); }
.submit-tip { display:block; margin-top:20rpx; color:var(--yb-ink-2); font-size:24rpx; line-height:1.6; }
.nav-bar {
  position:fixed; right:0; bottom:0; left:0; display:flex; flex-direction:column; gap:12rpx;
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid #f2f3f5; background: #fff;
}
.navigation-hint { display:block; color:var(--yb-muted); font-size:24rpx; line-height:1.6; }.nav-actions { display:flex; gap:12rpx; }.nav-actions > * { flex:1; }
</style>
