<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { fetchCategoryTree, type CategoryNode } from '@/service/api/category';
import { createProduct, uploadProductImage } from '@/service/api/product';
import { go } from '@/utils/navigate';
import { useUserStore } from '@/stores';

interface CategoryOption {
  id: string;
  name: string;
}

const userStore = useUserStore();
const step = ref(0);
const submitting = ref(false);
const uploading = ref(false);
const categories = ref<CategoryOption[]>([]);

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

const categoryName = computed(() => categories.value.find(item => item.id === form.categoryId)?.name || '请选择');

function flattenCategories(nodes: CategoryNode[], parents: string[] = []): CategoryOption[] {
  return nodes.flatMap(node => {
    const path = [...parents, node.name];
    const current = { id: String(node.id), name: path.join(' / ') };
    return [current, ...flattenCategories(node.children || [], path)];
  });
}

onMounted(async () => {
  await userStore.init();
  try {
    categories.value = flattenCategories(await fetchCategoryTree({ onlyEnabled: true }));
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '分类加载失败', icon: 'none' });
  }
});

function pickCategory() {
  uni.showActionSheet({
    itemList: categories.value.map(item => item.name),
    success: result => {
      form.categoryId = categories.value[result.tapIndex].id;
    }
  });
}

async function chooseImages() {
  const count = 6 - form.images.length;
  if (count <= 0 || uploading.value) return;
  try {
    const result = await uni.chooseImage({ count, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
    const filePaths = Array.isArray(result.tempFilePaths) ? result.tempFilePaths : [result.tempFilePaths];
    uploading.value = true;
    for (let index = 0; index < filePaths.length; index += 1) {
      uni.showLoading({ title: `上传中 ${index + 1}/${filePaths.length}` });
      form.images.push(await uploadProductImage(filePaths[index]));
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
  form.images.splice(index, 1);
}

function canNext(): boolean {
  if (step.value === 0) return form.title.trim().length > 0 && !!form.categoryId && form.brief.trim().length > 0;
  if (step.value === 1) {
    return Number(form.price) > 0
      && Number(form.shippingFee) >= 0
      && Number(form.taxFee) >= 0
      && Number(form.stock) >= 0;
  }
  if (step.value === 2) return form.images.length >= 1;
  return true;
}

async function submit() {
  if (!userStore.currentUser || !canNext()) return;
  submitting.value = true;
  try {
    const id = await createProduct({
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
    });
    uni.showToast({ title: '已提交审核', icon: 'success' });
    setTimeout(() => go(`/pages/buyer/product-detail?id=${encodeURIComponent(String(id))}`, true), 700);
  } catch (error) {
    uni.showToast({ title: error instanceof Error ? error.message : '商品提交失败', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="create-page yb-page">
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
      <wd-button v-if="step > 0" plain @click="step--">上一步</wd-button>
      <wd-button v-if="step < 3" type="primary" :disabled="!canNext() || uploading" @click="step++">下一步</wd-button>
      <wd-button v-else type="primary" :loading="submitting" @click="submit">提交审核</wd-button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
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
