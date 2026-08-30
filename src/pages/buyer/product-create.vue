<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import { fetchCategoryTree, type CategoryNode } from '@/service/api/category';
import { uploadProductImage } from '@/service/api/product';
import { go, useNavigationGuards } from '@/utils/navigate';
import { useUserStore } from '@/stores';
import { usePageOperation } from '@/utils/page-operation';
import { getAccessToken } from '@/service/request/token';
import { beginNextProduct, createProductWithReceipt, productCreateMessage, readProductCreateReceipt, reconcileProductCreation, type ProductCreateReceipt } from '@/utils/product-create';
import EmptyState from '@/components/common/empty-state.vue';

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
const loading = ref(true);
const loadFailed = ref(false);
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
  loading.value = false;
  loadFailed.value = true;
  step.value = 0;
  submitting.value = false;
  uploading.value = false;
  submitted.value = false;
  submittedId.value = undefined;
  receipt.value = undefined;
  receiptFailed.value = false;
  categories.value = [];
  Object.assign(form, { title: '', brief: '', description: '', categoryId: '', price: '99', shippingFee: '0', taxFee: '0', stock: 10, afterSaleType: 'SEVEN_DAY_NO_REASON', overseasClearance: false, images: [] });
});
const canPublish = computed(() => page.visible.value && !loading.value && !loadFailed.value && !receiptFailed.value && !receipt.value && userStore.canSwitchToBuyer);

const categoryName = computed(() => categories.value.find(item => item.id === form.categoryId)?.name || '请选择');

function flattenCategories(nodes: CategoryNode[], parents: string[] = []): CategoryOption[] {
  return nodes.flatMap(node => {
    const path = [...parents, node.name];
    const current = { id: String(node.id), name: path.join(' / ') };
    return [current, ...flattenCategories(node.children || [], path)];
  });
}

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
      return;
    }
    await userStore.refreshProfile();
    if (!valid() || !userStore.canSwitchToBuyer) return;
    const tree = await fetchCategoryTree({ onlyEnabled: true });
    if (valid()) categories.value = flattenCategories(tree);
  } catch (error) {
    if (!valid()) return;
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '发布资格或分类加载失败', icon: 'none' });
  } finally {
    if (operation.sameSession() && sequence === loadSequence) loading.value = false;
  }
}
onShow(load);
onHide(() => { loadSequence++; loading.value = false; });

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
  if (page.visible.value && !submitting.value && !receiptFailed.value && receipt.value?.state === 'verified' && submittedId.value != null) go(`/pages/buyer/product-detail?id=${encodeURIComponent(String(submittedId.value))}`, true);
}

function pickCategory() {
  if (!page.visible.value || !canPublish.value || submitting.value || uploading.value || submitted.value || !categories.value.length) return;
  const operation = page.capture();
  const options = [...categories.value];
  uni.showActionSheet({
    itemList: options.map(item => item.name),
    success: result => {
      if (operation.isCurrent() && options[result.tapIndex]) form.categoryId = options[result.tapIndex].id;
    }
  });
}

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
  if (step.value === 0) return form.title.trim().length > 0 && !!form.categoryId && form.brief.trim().length > 0;
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

async function submit() {
  if (!page.visible.value || !canPublish.value || submitting.value || uploading.value || submitted.value) return;
  if (!form.title.trim() || !categories.value.some(item => item.id === form.categoryId) || !form.brief.trim() || !form.images.length
    || ![form.price, form.shippingFee, form.taxFee].every(value => Number.isFinite(Number(value)))
    || Number(form.price) <= 0 || Number(form.shippingFee) < 0 || Number(form.taxFee) < 0
    || !Number.isSafeInteger(Number(form.stock)) || Number(form.stock) < 0) {
    uni.showToast({ title: '请核对商品信息、金额、整数库存和图片', icon: 'none' });
    return;
  }
  submitting.value = true;
  const operation = page.capture();
  let created: ProductCreateReceipt | undefined;
  try {
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
      description: form.description.trim() || form.brief.trim(),
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
  <view v-if="receipt" class="receipt-panel">
    <text>{{ productCreateMessage(receipt) }}</text>
    <text>原商品：{{ receipt.request.title }}</text>
    <wd-button block plain :loading="loading" :disabled="submitting || uploading" @click="load">核对原商品</wd-button>
    <wd-button v-if="submittedId != null" block type="primary" :disabled="submitting || receiptFailed" @click="viewOriginalProduct">查看提交结果</wd-button>
    <wd-button v-if="receipt.state === 'verified'" block plain :disabled="loading || submitting || uploading || receiptFailed" @click="startNext">发布另一件商品</wd-button>
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
  <EmptyState v-else-if="!categories.length" title="暂无可用商品分类" description="当前无法发布，请稍后重新加载" action-text="重新加载" @action="load" />
  <view v-else class="create-page yb-page">
    <wd-steps :active="step">
      <wd-step title="基本信息" />
      <wd-step title="价格库存" />
      <wd-step title="商品图片" />
      <wd-step title="确认提交" />
    </wd-steps>

    <view class="content">
      <view v-if="step === 0" class="form">
        <wd-input v-model="form.title" label="商品标题" placeholder="请输入商品标题" :maxlength="128" />
        <wd-cell title="分类" :value="categoryName" is-link @click="pickCategory" />
        <wd-textarea v-model="form.brief" label="商品简介" placeholder="30 字以内" :max-length="30" show-word-limit />
        <wd-textarea v-model="form.description" label="详细描述" placeholder="可选，500 字以内" :max-length="500" show-word-limit />
      </view>

      <view v-if="step === 1" class="form">
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

      <view v-if="step === 2" class="form">
        <text class="hint">至少 1 张，最多 6 张</text>
        <view class="image-grid">
          <view v-for="(image, index) in form.images" :key="String(image.id)" class="image-cell">
            <image :src="image.url" mode="aspectFill" class="image" />
            <view class="remove" @click="removeImage(index)"><wd-icon name="close" size="13px" color="#fff" /></view>
          </view>
          <view v-if="form.images.length < 6" class="add" @click="chooseImages"><wd-icon name="add" size="22px" /><text>{{ uploading ? '上传中' : '添加图片' }}</text></view>
        </view>
      </view>

      <view v-if="step === 3" class="summary">
        <view class="row"><text class="label">标题</text><text>{{ form.title }}</text></view>
        <view class="row"><text class="label">分类</text><text>{{ categoryName }}</text></view>
        <view class="row"><text class="label">售价</text><text>U {{ form.price }}</text></view>
        <view class="row"><text class="label">库存</text><text>{{ form.stock }}</text></view>
        <view class="row"><text class="label">图片</text><text>{{ form.images.length }} 张</text></view>
        <text class="submit-tip">提交后商品进入平台审核，审核通过后才可上架销售。</text>
      </view>
    </view>

    <view class="nav-bar">
      <wd-button v-if="submittedId != null" type="primary" @click="go(`/pages/buyer/product-detail?id=${encodeURIComponent(String(submittedId))}`, true)">查看提交结果</wd-button>
      <wd-button v-if="step > 0" plain :disabled="submitting || uploading" @click="step--">上一步</wd-button>
      <wd-button v-if="step < 3" type="primary" :disabled="!canNext() || submitting || uploading" @click="step++">下一步</wd-button>
      <wd-button v-else type="primary" :loading="submitting" :disabled="submitted || uploading" @click="submit">{{ submitted ? '已提交' : '提交审核' }}</wd-button>
    </view>
  </view>
  </view>
</template>

<style lang="scss" scoped>
.publish-page { min-height:100%; }
.receipt-panel { display:flex; flex-direction:column; gap:16rpx; margin:24rpx; padding:24rpx; background:#fff; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); font-size:26rpx; }
.create-page { min-height:100%; box-sizing:border-box; padding:24rpx 24rpx 200rpx; }.content { min-height:400rpx; margin-top:20rpx; padding:24rpx; border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); background:#fff; box-shadow:var(--yb-shadow-card); }
.hint { display: block; margin-bottom: 16rpx; font-size: 22rpx; color: #86909c; }
.image-grid { display: flex; flex-wrap: wrap; gap: 12rpx; }
.image-cell, .add { width: 200rpx; height: 200rpx; }
.image-cell { position: relative; }
.image { width: 100%; height: 100%; border-radius: 8rpx; }
.remove {
  position: absolute; top: 4rpx; right: 4rpx; display: flex; align-items: center; justify-content: center;
  width:36rpx; height:36rpx; border-radius:50%; background:rgba(0,0,0,.55); color:#fff;
}
.add {
  display: flex; align-items: center; justify-content: center; box-sizing: border-box;
  flex-direction:column; gap:8rpx; border:2rpx dashed #c9cdd4; border-radius:var(--yb-radius-md); background:#f7f8fa; color:#86909c; font-size:20rpx;
}
.summary .row { display: flex; justify-content: space-between; gap: 24rpx; padding: 18rpx 0; border-bottom: 1rpx solid #f2f3f5; font-size: 24rpx; }
.label { flex-shrink: 0; color: #86909c; }
.submit-tip { display: block; margin-top: 20rpx; color: #ff7d00; font-size: 22rpx; line-height: 1.6; }
.nav-bar {
  position: fixed; right: 0; bottom: 0; left: 0; display: flex; gap: 12rpx;
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid #f2f3f5; background: #fff;
}
.nav-bar > * { flex: 1; }
</style>
