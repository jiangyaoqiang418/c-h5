<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { buyerApi, productApi } from '@shared';
import { go } from '@/utils/navigate';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const step = ref(0);
const submitting = ref(false);
const categories = ref<{ id: number; name: string }[]>([]);

const form = reactive<buyerApi.CreateProductParams>({
  sellerId: 0,
  title: '',
  summary: '',
  description: '',
  categoryId: 0,
  price: '99',
  shippingFee: '0',
  tax: '0',
  stock: 10,
  aftersaleType: '7day-no-reason' as Api.Product.AftersaleType,
  overseasCustoms: false,
  images: []
});

onMounted(async () => {
  const tree = await productApi.fetchCategoryTree();
  categories.value = (tree as any[]).map(t => ({ id: t.id, name: t.name }));
});

function pickCategory() {
  uni.showActionSheet({
    itemList: categories.value.map(c => c.name),
    success: r => {
      form.categoryId = categories.value[r.tapIndex].id;
    }
  });
}

const categoryName = () => categories.value.find(c => c.id === form.categoryId)?.name || '请选择';

async function addImage() {
  if (form.images.length >= 6) return;
  uni.showLoading({ title: '上传中…' });
  await new Promise(r => setTimeout(r, 800));
  form.images.push(`https://picsum.photos/seed/p-${Date.now()}/600/600`);
  uni.hideLoading();
}

function removeImage(i: number) {
  form.images.splice(i, 1);
}

function canNext(): boolean {
  if (step.value === 0) return form.title.length >= 3 && !!form.categoryId && form.summary.length >= 5;
  if (step.value === 1) return Number(form.price) > 0 && form.stock > 0;
  if (step.value === 2) return form.images.length >= 1;
  return false;
}

async function submit() {
  if (!userStore.currentUser) return;
  form.sellerId = userStore.currentUser.id;
  if (!form.description) form.description = form.summary;
  submitting.value = true;
  try {
    const p = await buyerApi.createProductMock(form);
    uni.showToast({ title: '已上架', icon: 'success' });
    setTimeout(() => go(`/pages/product/detail?id=${p.id}`, true), 700);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="pc-page">
    <wd-steps :active="step">
      <wd-step title="基本信息" />
      <wd-step title="价格库存" />
      <wd-step title="商品图片" />
      <wd-step title="确认提交" />
    </wd-steps>

    <view class="content">
      <view v-if="step === 0" class="form">
        <wd-input v-model="form.title" label="商品标题" placeholder="≥ 3 字" />
        <wd-cell title="分类" :value="categoryName()" is-link @click="pickCategory" />
        <wd-textarea v-model="form.summary" placeholder="一句话简介（≥ 5 字）" :max-length="60" />
      </view>

      <view v-if="step === 1" class="form">
        <wd-input v-model="form.price" label="售价 (USDT)" type="digit" />
        <wd-input v-model="form.shippingFee" label="运费 (USDT)" type="digit" />
        <wd-input v-model="form.tax" label="税费 (USDT)" type="digit" />
        <wd-input v-model="form.stock" label="库存" type="number" />
        <wd-cell title="售后类型" :value="form.aftersaleType">
          <wd-radio-group v-model="form.aftersaleType" inline>
            <wd-radio value="7day-no-reason">7天</wd-radio>
            <wd-radio value="shop-warranty">店保</wd-radio>
            <wd-radio value="national-warranty">国保</wd-radio>
          </wd-radio-group>
        </wd-cell>
        <wd-cell title="海外过关（不可退）">
          <wd-switch v-model="form.overseasCustoms" />
        </wd-cell>
      </view>

      <view v-if="step === 2" class="form">
        <text class="hint">至少 1 张，最多 6 张</text>
        <view class="img-grid">
          <view v-for="(u, i) in form.images" :key="u" class="img-cell">
            <image :src="u" mode="aspectFill" class="img" />
            <view class="del" @click="removeImage(i)">✕</view>
          </view>
          <view v-if="form.images.length < 6" class="add" @click="addImage">+</view>
        </view>
      </view>

      <view v-if="step === 3" class="form summary">
        <view class="row"><text class="lbl">标题：</text>{{ form.title }}</view>
        <view class="row"><text class="lbl">分类：</text>{{ categoryName() }}</view>
        <view class="row"><text class="lbl">售价：</text>U {{ form.price }}</view>
        <view class="row"><text class="lbl">库存：</text>{{ form.stock }}</view>
        <view class="row"><text class="lbl">海外：</text>{{ form.overseasCustoms ? '是' : '否' }}</view>
        <view class="row"><text class="lbl">图片：</text>{{ form.images.length }} 张</view>
      </view>
    </view>

    <view class="nav-bar">
      <wd-button v-if="step > 0" plain @click="step--">上一步</wd-button>
      <wd-button v-if="step < 3" type="primary" :disabled="!canNext()" @click="step++">下一步</wd-button>
      <wd-button v-else type="primary" :loading="submitting" @click="submit">立即上架</wd-button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.pc-page { min-height: 100vh; background: #f7f8fa; padding: 16rpx; padding-bottom: 200rpx; }
.content { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-top: 16rpx; min-height: 400rpx; }
.hint { display: block; font-size: 22rpx; color: #86909c; margin-bottom: 16rpx; }
.img-grid { display: flex; flex-wrap: wrap; gap: 12rpx; }
.img-cell { position: relative; width: 200rpx; height: 200rpx; }
.img { width: 100%; height: 100%; border-radius: 8rpx; }
.del { position: absolute; top: 4rpx; right: 4rpx; background: rgba(0,0,0,0.55); color: #fff; width: 32rpx; height: 32rpx; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18rpx; }
.add { width: 200rpx; height: 200rpx; background: #f7f8fa; border: 2rpx dashed #c9cdd4; border-radius: 8rpx; display: flex; align-items: center; justify-content: center; color: #86909c; font-size: 60rpx; }
.summary .row { display: block; font-size: 26rpx; padding: 12rpx 0; border-bottom: 1rpx solid #f2f3f5; }
.summary .lbl { color: #86909c; }
.nav-bar {
  position: fixed; bottom: 0; left: 0; right: 0;
  background: #fff;
  padding: 16rpx 24rpx;
  padding-bottom: calc(16rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid #f2f3f5;
  display: flex;
  gap: 12rpx;
}
.nav-bar > * { flex: 1; }
</style>
