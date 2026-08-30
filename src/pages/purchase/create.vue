<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onHide, onLoad, onShow } from '@dcloudio/uni-app';
import { go, useNavigationGuards } from '@/utils/navigate';
import { useUserStore } from '@/stores';
import { fetchCategoryTree } from '@/service/api/category';
import { fetchMyAddresses, type AddressRecord } from '@/service/api/address';
import { uploadPurchaseImage } from '@/service/api/purchase';
import { usePageOperation } from '@/utils/page-operation';
import { getAccessToken } from '@/service/request/token';
import { beginNextPurchase, createPurchaseWithReceipt, purchaseCategoryOptions, purchaseCreateMessage, readPurchaseCreateReceipt, reconcilePurchaseCreation, type PurchaseCreateReceipt } from '@/utils/purchase-create';
import EmptyState from '@/components/common/empty-state.vue';

const { requireLogin } = useNavigationGuards();

const userStore = useUserStore();
const submitting = ref(false);
const submittedId = ref<string | number>();
const receipt = ref<PurchaseCreateReceipt>();
const receiptFailed = ref(false);
const loading = ref(true);
const loadFailed = ref(false);
let loadSequence = 0;

const categoryNames = ref<string[]>([]);
const categoryIds = ref<string[]>([]);
const addresses = ref<AddressRecord[]>([]);
const images = ref<Api.RealProduct.FileUploadResult[]>([]);
const uploading = ref(false);

const form = reactive({
  productTitle: '',
  productDescription: '',
  categoryName: '',
  categoryId: '',
  budgetAmount: 500,
  expectedDays: 14,
  overseasCustoms: false,
  aftersaleType: '7day-no-reason' as Api.Product.AftersaleType,
  appeal: '',
  addressId: ''
});
function resetForm() {
  images.value = [];
  Object.assign(form, { productTitle: '', productDescription: '', categoryName: '', categoryId: '', budgetAmount: 500, expectedDays: 14, overseasCustoms: false, aftersaleType: '7day-no-reason', appeal: '', addressId: '' });
}
const page = usePageOperation(() => {
  loadSequence++;
  submitting.value = false;
  submittedId.value = undefined;
  receipt.value = undefined;
  receiptFailed.value = false;
  uploading.value = false;
  loading.value = false;
  loadFailed.value = true;
  addresses.value = [];
  categoryNames.value = [];
  categoryIds.value = [];
  resetForm();
});
const canCreate = computed(() => page.visible.value && !!userStore.currentUser && !!userStore.realUserId
  && !loading.value && !loadFailed.value && !receiptFailed.value && !receipt.value);
const formDisabled = computed(() => !canCreate.value || submitting.value || uploading.value);

onLoad(query => {
  if (query?.productHint) {
    try { form.productTitle = decodeURIComponent(String(query.productHint)); }
    catch { form.productTitle = String(query.productHint); }
  }
  if (query?.categoryId) form.categoryId = String(query.categoryId);
});

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
      await requireLogin(`/pages/purchase/create?productHint=${encodeURIComponent(form.productTitle)}&categoryId=${encodeURIComponent(form.categoryId)}`);
      return;
    }
    refreshReceipt();
    if (receiptFailed.value) return;
    if (receipt.value) {
      await reconcilePurchaseCreation(userStore.realUserId!, valid);
      if (valid()) refreshReceipt();
      return;
    }
    const [tree, addressList] = await Promise.all([fetchCategoryTree({ onlyEnabled: true }), fetchMyAddresses()]);
    if (!valid()) return;
    const leaves = purchaseCategoryOptions(tree);
    categoryNames.value = leaves.map(l => l.name);
    categoryIds.value = leaves.map(l => l.id);
    addresses.value = addressList;
    form.categoryName = leaves.find(item => String(item.id) === form.categoryId)?.name || '';
    if (!categoryIds.value.includes(form.categoryId)) form.categoryId = '';
    if (!addressList.some(address => String(address.id) === form.addressId)) form.addressId = String(addressList.find(address => address.isDefault)?.id ?? addressList[0]?.id ?? '');
  } catch (error) {
    if (!valid()) return;
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '求购数据加载失败', icon: 'none' });
  } finally {
    if (operation.sameSession() && sequence === loadSequence) loading.value = false;
  }
}
onShow(load);
onHide(() => { loadSequence++; loading.value = false; });

function refreshReceipt() {
  try {
    receipt.value = userStore.realUserId ? readPurchaseCreateReceipt(userStore.realUserId) : undefined;
    submittedId.value = receipt.value?.state === 'verified' ? receipt.value.demandId : undefined;
    receiptFailed.value = false;
  } catch { receiptFailed.value = true; }
}

function viewOriginalPurchase() {
  if (page.visible.value && !submitting.value && !receiptFailed.value && receipt.value?.state === 'verified' && submittedId.value != null) go(`/pages/purchase/detail?id=${encodeURIComponent(String(submittedId.value))}`, true);
}

async function startNext() {
  if (!page.visible.value || loading.value || submitting.value || uploading.value || receiptFailed.value || receipt.value?.state !== 'verified' || !userStore.realUserId) return;
  try {
    beginNextPurchase(userStore.realUserId, receipt.value.attempt);
    refreshReceipt();
    resetForm();
    await load();
  } catch (error) {
    refreshReceipt();
    uni.showToast({ title: error instanceof Error ? error.message : '请先核对原求购', icon: 'none' });
  }
}

function selectCategory() {
  if (formDisabled.value || !categoryIds.value.length) return;
  const operation = page.capture();
  const ids = [...categoryIds.value];
  const names = [...categoryNames.value];
  uni.showActionSheet({
    itemList: names,
    success: r => {
      if (!operation.isCurrent() || !ids[r.tapIndex]) return;
      form.categoryName = names[r.tapIndex];
      form.categoryId = ids[r.tapIndex];
    }
  });
}

function selectAddress() {
  if (formDisabled.value) return;
  if (!addresses.value.length) return go('/pages/my/addresses');
  const operation = page.capture();
  const options = [...addresses.value];
  uni.showActionSheet({
    itemList: options.map(address => `${address.receiverName} ${address.receiverPhone} · ${address.detail}`),
    success: result => { if (operation.isCurrent() && options[result.tapIndex]) form.addressId = String(options[result.tapIndex].id); }
  });
}

async function chooseImages() {
  const count = 4 - images.value.length;
  if (formDisabled.value || count <= 0) return;
  const operation = page.capture();
  uploading.value = true;
  try {
    const picked = await uni.chooseImage({ count, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
    if (!operation.afterPicker()) return;
    const filePaths = Array.isArray(picked.tempFilePaths) ? picked.tempFilePaths : [picked.tempFilePaths];
    for (let index = 0; index < Math.min(filePaths.length, count); index += 1) {
      if (!operation.isCurrent()) return;
      const file = await uploadPurchaseImage(filePaths[index]);
      if (!operation.isCurrent()) return;
      images.value.push(file);
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
  if (formDisabled.value) return;
  images.value.splice(index, 1);
}

async function submit() {
  if (formDisabled.value) return;
  if (!form.productTitle.trim()) return uni.showToast({ title: '请输入商品名', icon: 'none' });
  if (!categoryIds.value.includes(form.categoryId)) return uni.showToast({ title: '请选择有效分类', icon: 'none' });
  const address = addresses.value.find(item => String(item.id) === form.addressId);
  if (!address) return uni.showToast({ title: '请选择有效收货地址', icon: 'none' });
  if (!Number.isFinite(Number(form.budgetAmount)) || Number(form.budgetAmount) <= 0) return uni.showToast({ title: '预算必须为正数', icon: 'none' });
  if (!Number.isSafeInteger(Number(form.expectedDays)) || Number(form.expectedDays) <= 0) return uni.showToast({ title: '期望天数必须为正整数', icon: 'none' });
  if (form.appeal.trim().length < 10) return uni.showToast({ title: '说明至少 10 字', icon: 'none' });
  if (!userStore.realUserId) return;
  const operation = page.capture();
  const request = {
    productTitle: form.productTitle.trim(),
    productDescription: form.productDescription.trim() || form.appeal.trim(),
    categoryId: form.categoryId,
    budgetAmount: String(form.budgetAmount),
    expectedDays: Number(form.expectedDays),
    overseasCustoms: form.overseasCustoms,
    aftersaleType: form.aftersaleType,
    appeal: form.appeal.trim(),
    addressId: form.addressId,
    evidenceUrls: images.value.map(image => ({ bucket: image.bucket, filePath: image.filePath }))
  };
  submitting.value = true;
  let created: PurchaseCreateReceipt | undefined;
  try {
    created = await createPurchaseWithReceipt(request, [...images.value], address, operation.isCurrent);
    if (!operation.sameSession()) return;
    refreshReceipt();
    if (created && operation.isCurrent()) uni.showToast({ title: purchaseCreateMessage(created), icon: 'none' });
  } catch (error) {
    if (operation.sameSession()) refreshReceipt();
    if (operation.isCurrent()) uni.showToast({ title: receipt.value ? purchaseCreateMessage(receipt.value) : error instanceof Error ? error.message : '求购提交失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) {
      submitting.value = false;
      if (page.visible.value) await load();
      if (created && operation.isCurrent() && !loadFailed.value && !receiptFailed.value && receipt.value?.state === 'verified'
        && receipt.value.attempt === created.attempt) operation.schedule(viewOriginalPurchase, 600);
    }
  }
}
</script>

<template>
  <view class="create-page yb-page">
    <view v-if="receipt" class="receipt-panel">
      <text>{{ purchaseCreateMessage(receipt) }}</text>
      <text>原求购：{{ receipt.request.productTitle }}</text>
      <wd-button block plain :loading="loading" :disabled="submitting || uploading" @click="load">核对原求购</wd-button>
      <wd-button v-if="submittedId != null" block type="primary" :disabled="submitting || receiptFailed" @click="viewOriginalPurchase">查看提交结果</wd-button>
      <wd-button v-if="receipt.state === 'verified'" block plain :disabled="loading || submitting || uploading || receiptFailed" @click="startNext">发起另一笔求购</wd-button>
    </view>
    <wd-button v-if="receiptFailed" block plain :loading="loading" @click="load">本机提交记录读取失败，已暂停提交，点击重试</wd-button>
    <wd-button v-if="loadFailed" block plain :loading="loading" @click="load">求购数据加载失败，点击重试</wd-button>
    <view v-if="loading && !receipt" class="notice">正在加载求购信息…</view>
    <EmptyState v-else-if="!userStore.currentUser && !loadFailed" title="请先登录" description="登录后发起求购或核对提交结果" action-text="去登录" @action="requireLogin('/pages/purchase/create')" />
    <template v-else-if="userStore.currentUser && !receipt && !receiptFailed">
    <view v-if="!loading && !loadFailed && !categoryIds.length" class="notice">暂无可用的三级商品分类，暂不能提交求购。<wd-button block plain @click="load">重新加载分类</wd-button></view>
    <view class="form-card">
      <wd-input v-model="form.productTitle" :disabled="formDisabled" label="商品标题" placeholder="如 iPhone 16 Pro Max 256GB" />
      <wd-cell title="商品分类" :value="form.categoryName || '请选择'" is-link @click="selectCategory" />
      <wd-cell title="收货地址" :value="addresses.find(address => String(address.id) === form.addressId)?.detail || '请选择'" is-link @click="selectAddress" />
      <wd-input v-model="form.budgetAmount" :disabled="formDisabled" label="预算 (USDT)" type="digit" />
      <wd-input v-model="form.expectedDays" :disabled="formDisabled" label="期望天数" type="number" />
      <wd-cell title="海外过关">
        <wd-switch v-model="form.overseasCustoms" :disabled="formDisabled" />
      </wd-cell>
      <wd-cell title="售后类型" :value="form.aftersaleType">
        <wd-radio-group v-model="form.aftersaleType" :disabled="formDisabled" inline>
          <wd-radio value="7day-no-reason">7天无理由</wd-radio>
          <wd-radio value="shop-warranty">店保</wd-radio>
          <wd-radio value="national-warranty">国保</wd-radio>
          <wd-radio value="none">无</wd-radio>
        </wd-radio-group>
      </wd-cell>
      <wd-textarea v-model="form.productDescription" :disabled="formDisabled" label="商品描述" placeholder="可选" :max-length="200" />
      <wd-textarea v-model="form.appeal" :disabled="formDisabled" label="求购说明" placeholder="≥ 10 字，详细要求" :max-length="500" show-word-limit />
      <view class="image-field">
        <text class="image-label">参考图片（可选，最多 4 张）</text>
        <view class="image-grid">
          <view v-for="(image, index) in images" :key="String(image.id)" class="image-cell">
            <image :src="image.url" mode="aspectFill" class="image" />
            <view class="remove" @click="removeImage(index)"><wd-icon name="close" size="22rpx" color="#fff" /></view>
          </view>
          <view v-if="images.length < 4" class="add" @click="chooseImages"><text v-if="uploading">上传中</text><wd-icon v-else name="add" size="42rpx" /></view>
        </view>
      </view>
    </view>
    <wd-button type="primary" block class="submit-btn" :loading="submitting" :disabled="formDisabled || !categoryIds.length" @click="submit">{{ uploading ? '图片上传中' : '提交求购' }}</wd-button>
    </template>
  </view>
</template>

<style lang="scss" scoped>
.create-page {
  min-height: 100%;
  padding: 20rpx 24rpx 32rpx;
}
.form-card {
  background: #fff;
  overflow:hidden; border:1rpx solid var(--yb-border); border-radius: var(--yb-radius-lg); box-shadow:var(--yb-shadow-card);
}
.submit-btn {
  margin: 24rpx 0;
}
.receipt-panel { display: flex; flex-direction: column; gap: 16rpx; margin-bottom: 20rpx; padding: 24rpx; border-radius: var(--yb-radius-lg); background: #fff6e8; color: #83510b; font-size: 26rpx; }
.notice { padding: 24rpx 0; color: var(--yb-muted); font-size: 24rpx; }
.image-field { padding: 24rpx 32rpx; }
.image-label { display: block; margin-bottom: 16rpx; color: #4e5969; font-size: 26rpx; }
.image-grid { display: flex; flex-wrap: wrap; gap: 12rpx; }
.image-cell, .add { width: 180rpx; height: 180rpx; }
.image-cell { position: relative; }
.image { width: 100%; height: 100%; border-radius: 12rpx; }
.remove { position: absolute; top: 4rpx; right: 4rpx; display: flex; align-items: center; justify-content: center; width: 36rpx; height: 36rpx; border-radius: 50%; background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 26rpx; }
.add { display: flex; align-items: center; justify-content: center; box-sizing: border-box; border: 2rpx dashed #b9bdc7; border-radius: 12rpx; background: #f5f5f2; color: var(--yb-brand); font-size: 24rpx; }
</style>
