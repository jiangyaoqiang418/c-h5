<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { onHide, onLoad, onShow } from '@dcloudio/uni-app';
import { go, useNavigationGuards } from '@/utils/navigate';
import { useUserStore } from '@/stores';
import { fetchCategoryTree, type CategoryNode } from '@/service/api/category';
import { fetchMyAddresses, type AddressRecord } from '@/service/api/address';
import { uploadPurchaseImage } from '@/service/api/purchase';
import { usePageOperation } from '@/utils/page-operation';
import { getAccessToken } from '@/service/request/token';
import { beginNextPurchase, createPurchaseWithReceipt, purchaseCategoryOptions, purchaseCreateMessage, readPurchaseCreateReceipt, reconcilePurchaseCreation, type PurchaseCreateReceipt } from '@/utils/purchase-create';
import EmptyState from '@/components/common/empty-state.vue';
import CategoryPicker from '@/components/common/category-picker.vue';

const { requireLogin } = useNavigationGuards();

const userStore = useUserStore();
const submitting = ref(false);
const submittedId = ref<string | number>();
const receipt = ref<PurchaseCreateReceipt>();
const receiptFailed = ref(false);
const loading = ref(true);
const loadFailed = ref(false);
const formInitialized = ref(false);
let loadSequence = 0;

const categoryNames = ref<string[]>([]);
const categoryIds = ref<string[]>([]);
const categoryTree = ref<CategoryNode[]>([]);
const categoryPickerOpen = ref(false);
const addresses = ref<AddressRecord[]>([]);
const addressPickerOpen = ref(false);
const aftersalePickerOpen = ref(false);
const aftersaleOptions: Array<{ label: string; value: Api.Product.AftersaleType }> = [
  { label: '7天无理由', value: '7day-no-reason' },
  { label: '店保', value: 'shop-warranty' },
  { label: '国保', value: 'national-warranty' },
  { label: '无', value: 'none' }
];
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
  aftersaleType: aftersaleOptions[0].value,
  appeal: '',
  addressId: ''
});
const aftersaleLabel = computed(() => aftersaleOptions.find(option => option.value === form.aftersaleType)?.label || '请选择');
const selectedAddress = computed(() => addresses.value.find(address => String(address.id) === form.addressId));
function resetForm() {
  images.value = [];
  Object.assign(form, { productTitle: '', productDescription: '', categoryName: '', categoryId: '', budgetAmount: 500, expectedDays: 14, overseasCustoms: false, aftersaleType: aftersaleOptions[0].value, appeal: '', addressId: '' });
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
  formInitialized.value = false;
  addresses.value = [];
  addressPickerOpen.value = false;
  aftersalePickerOpen.value = false;
  categoryNames.value = [];
  categoryIds.value = [];
  categoryTree.value = [];
  categoryPickerOpen.value = false;
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
      if (!receipt.value || receipt.value.state !== 'verified') return;
      beginNextPurchase(userStore.realUserId!, receipt.value.attempt);
      refreshReceipt();
    }
    const [tree, addressList] = await Promise.all([fetchCategoryTree({ onlyEnabled: true, onlyWithProduct: false }), fetchMyAddresses()]);
    if (!valid()) return;
    const leaves = purchaseCategoryOptions(tree);
    categoryTree.value = tree;
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
    if (operation.sameSession() && sequence === loadSequence) {
      loading.value = false;
      if (userStore.currentUser && !receipt.value && !receiptFailed.value) formInitialized.value = true;
    }
  }
}
onShow(load);
onHide(() => { loadSequence++; loading.value = false; addressPickerOpen.value = false; aftersalePickerOpen.value = false; });

function refreshReceipt() {
  try {
    receipt.value = userStore.realUserId ? readPurchaseCreateReceipt(userStore.realUserId) : undefined;
    submittedId.value = receipt.value?.state === 'verified' ? receipt.value.demandId : undefined;
    receiptFailed.value = false;
  } catch { receiptFailed.value = true; }
}

function viewOriginalPurchase() {
  if (!page.visible.value || submitting.value || receiptFailed.value || receipt.value?.state !== 'verified' || submittedId.value == null || !userStore.realUserId) return;
  const demandId = submittedId.value;
  beginNextPurchase(userStore.realUserId, receipt.value.attempt);
  refreshReceipt();
  go(`/pages/purchase/detail?id=${encodeURIComponent(String(demandId))}`, true);
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
  categoryPickerOpen.value = true;
}

function onCategorySelected(item: { id: string; name: string }) {
  form.categoryId = item.id;
  form.categoryName = item.name;
}

function selectAddress() {
  if (formDisabled.value) return;
  if (!addresses.value.length) return go('/pages/my/addresses');
  addressPickerOpen.value = true;
}

function chooseAddress(address: AddressRecord) {
  if (!addressPickerOpen.value || formDisabled.value || !addresses.value.some(item => String(item.id) === String(address.id))) return;
  form.addressId = String(address.id);
  addressPickerOpen.value = false;
}

function addressText(address: AddressRecord) {
  return [address.countryCode !== 'CN' ? address.country : '', address.province, address.city, address.district, address.detail].filter(Boolean).join(' ');
}

function selectAftersale() {
  if (formDisabled.value) return;
  aftersalePickerOpen.value = true;
}

function chooseAftersale(value: Api.Product.AftersaleType) {
  if (!aftersalePickerOpen.value || formDisabled.value || !aftersaleOptions.some(option => option.value === value)) return;
  form.aftersaleType = value;
  aftersalePickerOpen.value = false;
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
    <view v-if="receipt && receipt.state !== 'verified'" class="receipt-panel">
      <text>{{ purchaseCreateMessage(receipt) }}</text>
      <text>原求购：{{ receipt.request.productTitle }}</text>
      <wd-button block plain :loading="loading" :disabled="submitting || uploading" @click="load">核对原求购</wd-button>
      <wd-button v-if="submittedId != null" block type="primary" :disabled="submitting || receiptFailed" @click="viewOriginalPurchase">查看提交结果</wd-button>
    </view>
    <wd-button v-if="receiptFailed" block plain :loading="loading" @click="load">本机提交记录读取失败，已暂停提交，点击重试</wd-button>
    <wd-button v-if="loadFailed" block plain :loading="loading" @click="load">求购数据加载失败，点击重试</wd-button>
    <view v-if="loading && !receipt" class="notice">正在加载求购信息…</view>
    <EmptyState v-else-if="!userStore.currentUser && !loadFailed" title="请先登录" description="登录后发起求购或核对提交结果" action-text="去登录" @action="requireLogin('/pages/purchase/create')" />
    <!-- 加载只隐藏已创建表单；失败继续保留字段，并沿用 formDisabled 暂停操作。 -->
    <view v-if="formInitialized && userStore.currentUser && !receipt && !receiptFailed" v-show="!loading">
    <text class="form-intro">填写商品需求与预算，必填项完成后提交。</text>
    <view class="form-card">
      <view class="text-field"><text class="field-label">商品标题 <text class="field-note">必填</text></text><wd-input v-model="form.productTitle" :disabled="formDisabled" placeholder="如 iPhone 16 Pro Max 256GB" /></view>
      <wd-cell title="商品分类" :value="categoryIds.length ? form.categoryName || '请选择' : '暂不可选'" :is-link="!formDisabled && !!categoryIds.length" @click="selectCategory" />
      <view v-if="!loading && !loadFailed && !categoryIds.length" class="category-hint">分类暂不可用，选择后才可提交。<wd-button plain size="small" @click="load">重试</wd-button></view>
      <text class="form-section-label">预算与交付</text>
      <wd-cell title="收货地址" title-width="144rpx" custom-class="address-summary-cell" center :is-link="!formDisabled" @click="selectAddress">
        <view v-if="selectedAddress" class="address-summary">
          <text class="address-summary-detail">{{ addressText(selectedAddress) }}</text>
          <view class="address-summary-contact">
            <text class="address-summary-name">{{ selectedAddress.receiverName }}</text>
            <text class="address-summary-phone">{{ selectedAddress.receiverPhone }}</text>
          </view>
        </view>
        <text v-else>请选择</text>
      </wd-cell>
      <wd-input v-model="form.budgetAmount" :disabled="formDisabled" label="预算 (USDT)" type="digit" />
      <wd-input v-model="form.expectedDays" :disabled="formDisabled" label="期望天数" type="number" />
      <text class="form-section-label">服务要求</text>
      <wd-cell title="海外过关">
        <wd-switch v-model="form.overseasCustoms" :disabled="formDisabled" />
      </wd-cell>
      <wd-cell title="售后类型" :value="aftersaleLabel" :is-link="!formDisabled" @click="selectAftersale" />
      <text class="form-section-label">补充说明</text>
      <view class="text-field"><text class="field-label">商品描述 <text class="field-note">选填</text></text><wd-textarea auto-height v-model="form.productDescription" :disabled="formDisabled" placeholder="补充型号、颜色与规格，最多 200 字" :maxlength="200" /></view>
      <view class="text-field"><text class="field-label">求购说明 <text class="field-note">必填 · 至少 10 字</text></text><wd-textarea auto-height v-model="form.appeal" :disabled="formDisabled" placeholder="说明需要购买的商品及具体要求" :maxlength="500" show-word-limit /></view>
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
    </view>
    <CategoryPicker v-model="categoryPickerOpen" :tree="categoryTree" :selected-id="form.categoryId" @select="onCategorySelected" />
    <wd-popup v-model="aftersalePickerOpen" position="bottom" :safe-area-inset-bottom="true" custom-style="border-radius: 28rpx 28rpx 0 0; overflow: hidden;">
      <view class="aftersale-picker">
        <view class="aftersale-picker-header">
          <text class="aftersale-picker-title">选择售后类型</text>
          <view class="aftersale-picker-close" role="button" aria-label="关闭售后类型选择" @click="aftersalePickerOpen = false"><wd-icon name="close" size="20px" /></view>
        </view>
        <view class="aftersale-options">
          <view v-for="option in aftersaleOptions" :key="option.value" class="aftersale-option" :class="{ 'is-selected': form.aftersaleType === option.value }" role="radio" :aria-checked="form.aftersaleType === option.value" @click="chooseAftersale(option.value)">
            <text>{{ option.label }}</text>
            <view class="aftersale-option-check"><wd-icon v-if="form.aftersaleType === option.value" name="check" size="14px" color="#fff" /></view>
          </view>
        </view>
        <view class="aftersale-picker-footer"><wd-button plain block @click="aftersalePickerOpen = false">取消</wd-button></view>
      </view>
    </wd-popup>
    <wd-popup v-model="addressPickerOpen" position="bottom" :safe-area-inset-bottom="true" custom-style="border-radius: 28rpx 28rpx 0 0; overflow: hidden;">
      <view class="address-picker">
        <view class="address-picker-header">
          <text class="address-picker-title">选择收货地址</text>
          <view class="address-picker-close" role="button" aria-label="关闭地址选择" @click="addressPickerOpen = false"><wd-icon name="close" size="20px" /></view>
        </view>
        <scroll-view scroll-y class="address-picker-list" :style="{ height: `${Math.min(addresses.length, 4) * 196 + 40}rpx` }">
          <view class="address-picker-options">
            <view v-for="address in addresses" :key="String(address.id)" class="address-option" :class="{ 'is-selected': String(address.id) === form.addressId }" role="button" :aria-label="`${address.receiverName} ${address.receiverPhone} ${addressText(address)}${String(address.id) === form.addressId ? '，已选中' : ''}`" @click="chooseAddress(address)">
              <view class="address-option-content">
                <view class="address-option-contact">
                  <text class="address-option-name">{{ address.receiverName }}</text>
                  <text class="address-option-phone">{{ address.receiverPhone }}</text>
                  <text v-if="address.isDefault" class="address-option-tag">默认</text>
                </view>
                <text class="address-option-detail">{{ addressText(address) }}</text>
              </view>
              <view class="address-option-check"><wd-icon v-if="String(address.id) === form.addressId" name="check" size="14px" color="#fff" /></view>
            </view>
          </view>
        </scroll-view>
        <view class="address-picker-footer"><wd-button plain block @click="addressPickerOpen = false">取消</wd-button></view>
      </view>
    </wd-popup>
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
.category-hint { padding:12rpx 32rpx; display:flex; align-items:center; justify-content:space-between; gap:12rpx; color:var(--yb-muted); font-size:24rpx; }
.image-field { padding: 24rpx 32rpx; }
.image-label { display: block; margin-bottom: 16rpx; color: #4e5969; font-size: 26rpx; }
.image-grid { display: flex; flex-wrap: wrap; gap: 12rpx; }
.image-cell, .add { width: 180rpx; height: 180rpx; }
.image-cell { position: relative; }
.image { width: 100%; height: 100%; border-radius: 12rpx; }
.remove { position:absolute; top:0; right:0; display:flex; align-items:center; justify-content:center; width:88rpx; height:88rpx; color:#fff; font-size:26rpx; }.remove::before { content:''; position:absolute; width:40rpx; height:40rpx; border-radius:50%; background:rgba(0,0,0,.55); }.remove :deep(.wd-icon) { position:relative; }
.add { display: flex; align-items: center; justify-content: center; box-sizing: border-box; border: 2rpx dashed #b9bdc7; border-radius: 12rpx; background: #f5f5f2; color: var(--yb-brand); font-size: 24rpx; }
.form-intro { display:block; margin-bottom:16rpx; color:var(--yb-muted); font-size:24rpx; line-height:1.6; }
.text-field { padding:20rpx 32rpx; border-bottom:1rpx solid var(--yb-border); }
.field-label { display:block; margin-bottom:12rpx; color:var(--yb-ink); font-size:26rpx; font-weight:600; }
.field-note { margin-left:8rpx; color:var(--yb-muted); font-size:24rpx; font-weight:400; }
.text-field :deep(.wd-input), .text-field :deep(.wd-textarea) { padding:0; }
.text-field :deep(.wd-input__inner), .text-field :deep(.wd-textarea__inner) { text-align:left; }
:deep(.address-summary-cell .wd-cell__body) { align-items: center; }
:deep(.address-summary-cell .wd-cell__value) { min-width: 0; }
.address-summary { min-width: 0; text-align: left; }
.address-summary-contact { display: flex; align-items: center; gap: 12rpx; }
.address-summary-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--yb-ink-2); font-size: 26rpx; font-weight: 500; }
.address-summary-phone { flex-shrink: 0; color: var(--yb-muted); font-size: 24rpx; }
.address-summary-detail { display: block; overflow: hidden; margin-top: 6rpx; text-overflow: ellipsis; white-space: nowrap; color: var(--yb-muted); font-size: 24rpx; line-height: 1.5; }
.address-picker { background: var(--yb-surface); }
.address-picker-header { display: flex; align-items: center; justify-content: space-between; min-height: 104rpx; padding: 0 24rpx 0 32rpx; border-bottom: 1rpx solid var(--yb-hairline); }
.address-picker-title { color: var(--yb-ink); font-size: 30rpx; font-weight: 600; }
.address-picker-close { display: flex; align-items: center; justify-content: center; width: 88rpx; height: 88rpx; color: var(--yb-muted); }
.address-picker-list { max-height: 54vh; background: var(--yb-bg); }
.address-picker-options { padding: 20rpx 24rpx; }
.address-option { display: flex; align-items: center; gap: 20rpx; margin-bottom: 16rpx; padding: 24rpx; border: 1rpx solid var(--yb-hairline-2); border-radius: var(--yb-radius-md); background: var(--yb-surface); }
.address-option:last-child { margin-bottom: 0; }
.address-option.is-selected { border-color: var(--yb-brand); background: var(--yb-brand-soft); }
.address-option-content { flex: 1; min-width: 0; }
.address-option-contact { display: flex; align-items: center; gap: 12rpx; margin-bottom: 10rpx; }
.address-option-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--yb-ink); font-size: 28rpx; font-weight: 600; }
.address-option-phone { flex-shrink: 0; color: var(--yb-muted); font-size: 24rpx; }
.address-option-tag { flex-shrink: 0; padding: 2rpx 8rpx; border-radius: 6rpx; background: var(--yb-brand-soft); color: var(--yb-brand); font-size: 20rpx; line-height: 1.4; }
.address-option-detail { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; color: var(--yb-ink-2); font-size: 24rpx; line-height: 1.6; word-break: break-word; }
.address-option-check { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 36rpx; height: 36rpx; border: 2rpx solid var(--yb-hairline-2); border-radius: 50%; box-sizing: border-box; }
.is-selected .address-option-check { border-color: var(--yb-brand); background: var(--yb-brand); }
.address-picker-footer { padding: 20rpx 24rpx; border-top: 1rpx solid var(--yb-hairline); }
.aftersale-picker { background: var(--yb-surface); }
.aftersale-picker-header { display: flex; align-items: center; justify-content: space-between; min-height: 104rpx; padding: 0 24rpx 0 32rpx; border-bottom: 1rpx solid var(--yb-hairline); }
.aftersale-picker-title { color: var(--yb-ink); font-size: 30rpx; font-weight: 600; }
.aftersale-picker-close { display: flex; align-items: center; justify-content: center; width: 88rpx; height: 88rpx; color: var(--yb-muted); }
.aftersale-options { padding: 16rpx 24rpx; }
.aftersale-option { display: flex; align-items: center; justify-content: space-between; min-height: 96rpx; margin-bottom: 12rpx; padding: 0 24rpx; border: 1rpx solid var(--yb-hairline); border-radius: var(--yb-radius-sm); color: var(--yb-ink-2); font-size: 28rpx; }
.aftersale-option:last-child { margin-bottom: 0; }
.aftersale-option.is-selected { border-color: var(--yb-brand); background: var(--yb-brand-soft); color: var(--yb-brand); font-weight: 600; }
.aftersale-option-check { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 36rpx; height: 36rpx; border: 2rpx solid var(--yb-hairline-2); border-radius: 50%; box-sizing: border-box; }
.is-selected .aftersale-option-check { border-color: var(--yb-brand); background: var(--yb-brand); }
.aftersale-picker-footer { padding: 20rpx 24rpx; border-top: 1rpx solid var(--yb-hairline); }
.form-section-label { display:block; padding:20rpx 28rpx 12rpx; margin-top:8rpx; background:var(--yb-bg); color:var(--yb-muted); font-size:24rpx; font-weight:600; }.address-summary { text-align:left; }.address-summary-contact { margin-top:6rpx; color:var(--yb-muted); font-size:24rpx; }.address-summary-detail { color:var(--yb-ink); font-size:26rpx; }
</style>
