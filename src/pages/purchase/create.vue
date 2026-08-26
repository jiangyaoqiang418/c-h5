<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { go } from '@/utils/navigate';
import { useUserStore } from '@/stores';
import { fetchCategoryTree } from '@/service/api/category';
import { fetchMyAddresses, type AddressRecord } from '@/service/api/address';
import { createPurchase, uploadPurchaseImage } from '@/service/api/purchase';

const userStore = useUserStore();
const submitting = ref(false);

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

onLoad(query => {
  if (query?.productHint) form.productTitle = decodeURIComponent(query.productHint as string);
  if (query?.categoryId) form.categoryId = String(query.categoryId);
});

onMounted(async () => {
  try {
    const [tree, addressList] = await Promise.all([fetchCategoryTree({ onlyEnabled: true }), fetchMyAddresses()]);
    const leaves = tree.map(item => ({ id: item.id, name: item.name }));
    categoryNames.value = leaves.map(l => l.name);
    categoryIds.value = leaves.map(l => l.id);
    addresses.value = addressList;
    form.addressId = String(addressList.find(address => address.isDefault)?.id || addressList[0]?.id || '');
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '分类加载失败', icon: 'none' });
  }
});

function selectCategory() {
  uni.showActionSheet({
    itemList: categoryNames.value,
    success: r => {
      form.categoryName = categoryNames.value[r.tapIndex];
      form.categoryId = categoryIds.value[r.tapIndex];
    }
  });
}

function selectAddress() {
  if (!addresses.value.length) return uni.showToast({ title: '请先添加收货地址', icon: 'none' });
  uni.showActionSheet({
    itemList: addresses.value.map(address => `${address.receiverName} ${address.receiverPhone} · ${address.detail}`),
    success: result => { form.addressId = String(addresses.value[result.tapIndex].id); }
  });
}

async function chooseImages() {
  const count = 6 - images.value.length;
  if (count <= 0 || uploading.value) return;
  try {
    const picked = await uni.chooseImage({ count, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
    const filePaths = Array.isArray(picked.tempFilePaths) ? picked.tempFilePaths : [picked.tempFilePaths];
    uploading.value = true;
    for (let index = 0; index < filePaths.length; index += 1) {
      uni.showLoading({ title: `上传中 ${index + 1}/${filePaths.length}` });
      images.value.push(await uploadPurchaseImage(filePaths[index]));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as { errMsg?: string })?.errMsg || '图片上传失败');
    if (!message.includes('cancel')) uni.showToast({ title: message, icon: 'none' });
  } finally {
    uploading.value = false;
    uni.hideLoading();
  }
}

function removeImage(index: number) {
  images.value.splice(index, 1);
}

async function submit() {
  if (!form.productTitle.trim()) return uni.showToast({ title: '请输入商品名', icon: 'none' });
  if (!form.categoryId) return uni.showToast({ title: '请选择分类', icon: 'none' });
  if (!form.addressId) return uni.showToast({ title: '请选择收货地址', icon: 'none' });
  if (form.appeal.trim().length < 10) return uni.showToast({ title: '说明至少 10 字', icon: 'none' });
  await userStore.init();
  if (!userStore.realUserId) return;
  uni.showModal({
    title: '确认发起求购？',
    content: `预算 U ${form.budgetAmount} · 期望 ${form.expectedDays} 天内`,
    success: async r => {
      if (!r.confirm) return;
      submitting.value = true;
      try {
        const res = await createPurchase({
          productTitle: form.productTitle.trim(),
          productDescription: form.productDescription.trim() || form.appeal.trim(),
          categoryId: form.categoryId,
          budgetAmount: String(form.budgetAmount),
          expectedDays: form.expectedDays,
          overseasCustoms: form.overseasCustoms,
          aftersaleType: form.aftersaleType,
          appeal: form.appeal.trim(),
          addressId: form.addressId,
          evidenceUrls: images.value.map(image => ({ bucket: image.bucket, filePath: image.filePath }))
        }, userStore.realUserId);
        uni.showToast({ title: '发起成功', icon: 'success' });
        setTimeout(() => go(`/pages/purchase/detail?id=${res.id}`, true), 600);
      } catch (error) {
        uni.showToast({ title: error instanceof Error ? error.message : '求购提交失败', icon: 'none' });
      } finally {
        submitting.value = false;
      }
    }
  });
}
</script>

<template>
  <view class="create-page">
    <view class="form-card">
      <wd-input v-model="form.productTitle" label="商品标题" placeholder="如 iPhone 16 Pro Max 256GB" />
      <wd-cell title="商品分类" :value="form.categoryName || '请选择'" is-link @click="selectCategory" />
      <wd-cell title="收货地址" :value="addresses.find(address => String(address.id) === form.addressId)?.detail || '请选择'" is-link @click="selectAddress" />
      <wd-input v-model="form.budgetAmount" label="预算 (USDT)" type="digit" />
      <wd-input v-model="form.expectedDays" label="期望天数" type="number" />
      <wd-cell title="海外过关">
        <wd-switch v-model="form.overseasCustoms" />
      </wd-cell>
      <wd-cell title="售后类型" :value="form.aftersaleType">
        <wd-radio-group v-model="form.aftersaleType" inline>
          <wd-radio value="7day-no-reason">7天无理由</wd-radio>
          <wd-radio value="shop-warranty">店保</wd-radio>
          <wd-radio value="national-warranty">国保</wd-radio>
          <wd-radio value="none">无</wd-radio>
        </wd-radio-group>
      </wd-cell>
      <wd-textarea v-model="form.productDescription" label="商品描述" placeholder="可选" :max-length="200" />
      <wd-textarea v-model="form.appeal" label="求购说明" placeholder="≥ 10 字，详细要求" :max-length="500" show-word-limit />
      <view class="image-field">
        <text class="image-label">参考图片（可选，最多 6 张）</text>
        <view class="image-grid">
          <view v-for="(image, index) in images" :key="String(image.id)" class="image-cell">
            <image :src="image.url" mode="aspectFill" class="image" />
            <view class="remove" @click="removeImage(index)">×</view>
          </view>
          <view v-if="images.length < 6" class="add" @click="chooseImages">{{ uploading ? '上传中' : '+' }}</view>
        </view>
      </view>
    </view>
    <wd-button type="primary" block class="submit-btn" :loading="submitting" @click="submit">提交求购</wd-button>
  </view>
</template>

<style lang="scss" scoped>
.create-page {
  min-height: 100%;
  background: #f7f8fa;
  padding: 16rpx;
}
.form-card {
  background: #fff;
  border-radius: 16rpx;
}
.submit-btn {
  margin: 24rpx 0;
}
.image-field { padding: 24rpx 32rpx; }
.image-label { display: block; margin-bottom: 16rpx; color: #4e5969; font-size: 26rpx; }
.image-grid { display: flex; flex-wrap: wrap; gap: 12rpx; }
.image-cell, .add { width: 180rpx; height: 180rpx; }
.image-cell { position: relative; }
.image { width: 100%; height: 100%; border-radius: 8rpx; }
.remove { position: absolute; top: 4rpx; right: 4rpx; display: flex; align-items: center; justify-content: center; width: 36rpx; height: 36rpx; border-radius: 50%; background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 26rpx; }
.add { display: flex; align-items: center; justify-content: center; box-sizing: border-box; border: 2rpx dashed #c9cdd4; border-radius: 8rpx; background: #f7f8fa; color: #86909c; font-size: 52rpx; }
</style>
