<script setup lang="ts">
import { reactive, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { aftersaleApi, orderApi } from '@shared';
import { go } from '@/utils/navigate';
import CaseTypePicker from '@/components/aftersale/case-type-picker.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const order = ref<Api.Order.OrderRecord>();
const submitting = ref(false);

const form = reactive<{
  caseType?: Api.Order.AftersaleCaseType;
  appeal: string;
  evidenceUrls: string[];
}>({ appeal: '', evidenceUrls: [] });

onLoad(async query => {
  const orderId = Number(query?.orderId);
  if (orderId) order.value = await orderApi.fetchOrderDetail(orderId);
});

async function addImage() {
  if (form.evidenceUrls.length >= 6) return;
  uni.showLoading({ title: '上传中…' });
  await new Promise(r => setTimeout(r, 700));
  form.evidenceUrls.push(`https://picsum.photos/seed/ev-${Date.now()}/320/240`);
  uni.hideLoading();
}

function removeImage(i: number) {
  form.evidenceUrls.splice(i, 1);
}

async function submit() {
  if (!form.caseType) return uni.showToast({ title: '请选择售后类型', icon: 'none' });
  if (form.appeal.trim().length < 10) return uni.showToast({ title: '描述 ≥ 10 字', icon: 'none' });
  if (!order.value || !userStore.currentUser) return;
  submitting.value = true;
  try {
    const r = await aftersaleApi.createAftersaleMock({
      orderId: order.value.id,
      customerId: userStore.currentUser.id,
      caseType: form.caseType,
      appeal: form.appeal.trim(),
      evidenceUrls: form.evidenceUrls
    });
    if (r.ok && r.case) {
      uni.showToast({ title: '已提交', icon: 'success' });
      setTimeout(() => go(`/pages/aftersale/detail?id=${r.case!.id}`, true), 600);
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view v-if="order" class="create-page">
    <view v-if="order.overseasCustoms" class="overseas">🌏 海外直邮商品过关后不支持退换</view>

    <view class="step">
      <text class="step-title">1. 选择售后类型</text>
      <CaseTypePicker v-model="form.caseType" />
    </view>

    <view class="step">
      <text class="step-title">2. 描述问题</text>
      <wd-textarea v-model="form.appeal" placeholder="详细描述问题（≥ 10 字）" :max-length="500" show-word-limit />
    </view>

    <view class="step">
      <text class="step-title">3. 上传凭证（可选）</text>
      <view class="img-grid">
        <view v-for="(u, i) in form.evidenceUrls" :key="u" class="img-cell">
          <image :src="u" mode="aspectFill" class="img" />
          <view class="del" @click="removeImage(i)">✕</view>
        </view>
        <view v-if="form.evidenceUrls.length < 6" class="add" @click="addImage">+ 添加</view>
      </view>
    </view>

    <wd-button type="primary" block class="submit" :loading="submitting" @click="submit">提交申请</wd-button>
  </view>
</template>

<style lang="scss" scoped>
.create-page {
  min-height: 100vh;
  background: #f7f8fa;
  padding: 16rpx;
}
.overseas {
  background: #fff7e6;
  color: #ff7d00;
  padding: 16rpx;
  border-radius: 8rpx;
  font-size: 24rpx;
  margin-bottom: 16rpx;
}
.step {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
}
.step-title {
  display: block;
  font-size: 26rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
}
.img-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.img-cell {
  position: relative;
  width: 160rpx;
  height: 160rpx;
}
.img {
  width: 100%;
  height: 100%;
  border-radius: 8rpx;
}
.del {
  position: absolute;
  top: 4rpx;
  right: 4rpx;
  background: rgba(0,0,0,0.55);
  color: #fff;
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18rpx;
}
.add {
  width: 160rpx;
  height: 160rpx;
  background: #f7f8fa;
  border: 2rpx dashed #c9cdd4;
  border-radius: 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #86909c;
  font-size: 22rpx;
}
.submit {
  margin-top: 16rpx;
}
</style>
