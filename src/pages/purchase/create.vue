<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { go } from '@/utils/navigate';
import { useUserStore } from '@/stores';
import { fetchCategoryTree } from '@/service/api/category';
import { createPurchase } from '@/service/api/purchase';

const userStore = useUserStore();
const submitting = ref(false);

const categoryNames = ref<string[]>([]);
const categoryIds = ref<string[]>([]);

const form = reactive({
  productTitle: '',
  productDescription: '',
  categoryName: '',
  categoryId: '',
  budgetAmount: 500,
  expectedDays: 14,
  overseasCustoms: false,
  aftersaleType: '7day-no-reason' as Api.Product.AftersaleType,
  appeal: ''
});

onLoad(query => {
  if (query?.productHint) form.productTitle = decodeURIComponent(query.productHint as string);
  if (query?.categoryId) form.categoryId = String(query.categoryId);
});

onMounted(async () => {
  try {
    const tree = await fetchCategoryTree({ onlyEnabled: true });
    const leaves = tree.map(item => ({ id: item.id, name: item.name }));
    categoryNames.value = leaves.map(l => l.name);
    categoryIds.value = leaves.map(l => l.id);
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

async function submit() {
  if (!form.productTitle.trim()) return uni.showToast({ title: '请输入商品名', icon: 'none' });
  if (!form.categoryId) return uni.showToast({ title: '请选择分类', icon: 'none' });
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
          appeal: form.appeal.trim()
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
    </view>
    <wd-button type="primary" block class="submit-btn" :loading="submitting" @click="submit">提交求购</wd-button>
  </view>
</template>

<style lang="scss" scoped>
.create-page {
  min-height: 100vh;
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
</style>
