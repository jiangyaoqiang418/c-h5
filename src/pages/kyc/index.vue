<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { fetchKycDetail } from '@/service/api/kyc';
import KycStatusTag from '@/components/common/kyc-status-tag.vue';
import { useUserStore } from '@/stores';
import { requireLogin } from '@/utils/navigate';

const userStore = useUserStore();
const loading = ref(true);
const loadFailed = ref(false);
const detail = ref<Api.RealKyc.DetailVO | null>(null);

const status = computed<Api.User.KycStatus>(() => {
  if (detail.value?.status === 'PASSED') return 'approved';
  if (detail.value?.status === 'PENDING') return 'pending';
  if (detail.value?.status === 'REJECTED') return 'rejected';
  return 'none';
});

const statusTitle = computed(() => {
  if (status.value === 'approved') return '您已完成 KYC 实名认证';
  if (status.value === 'pending') return '实名认证审核中';
  if (status.value === 'rejected') return '实名认证未通过';
  return '实名认证暂未提交';
});

const statusDescription = computed(() => {
  if (status.value === 'approved') return '认证有效期和证件信息以当前认证记录为准。';
  if (status.value === 'pending') return '资料已提交，请等待平台审核。';
  if (status.value === 'rejected') return '请根据审核意见准备新的认证资料。';
  return '当前环境尚未提供可确认的 KYC 文件上传契约，暂不能在线提交认证资料。';
});

function formatTime(value?: Api.RealKyc.Id): string {
  if (value === undefined || value === null || value === '') return '-';
  const date = typeof value === 'number'
    ? new Date(value)
    : /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

async function load() {
  loading.value = true;
  loadFailed.value = false;
  try {
    if (!(await requireLogin('/pages/kyc/index'))) return;
    await userStore.init();
    if (!userStore.currentUser) return;
    detail.value = await fetchKycDetail();
  } catch (error) {
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : 'KYC 状态加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <view class="kyc-page">
    <view v-if="loading" class="loading">加载中...</view>

    <view v-else-if="loadFailed" class="error-card">
      <text class="title">认证状态加载失败</text>
      <text class="description">请检查网络后重新加载。</text>
      <wd-button type="primary" block @click="load">重新加载</wd-button>
    </view>

    <template v-else>
      <view class="status-card">
        <view class="status-head">
          <view>
            <KycStatusTag :status="status" />
            <text class="title">{{ statusTitle }}</text>
          </view>
        </view>
        <text class="description">{{ statusDescription }}</text>
        <text v-if="detail?.reviewRemark" class="review-remark">审核意见：{{ detail.reviewRemark }}</text>
      </view>

      <view v-if="detail" class="record-card">
        <view class="record-row"><text class="label">姓名</text><text>{{ detail.realName || '-' }}</text></view>
        <view class="record-row"><text class="label">证件类型</text><text>{{ detail.idType === 'PASSPORT' ? '护照' : '身份证' }}</text></view>
        <view class="record-row"><text class="label">证件号码</text><text>{{ detail.idNo || '-' }}</text></view>
        <view v-if="detail.nationality" class="record-row"><text class="label">国籍</text><text>{{ detail.nationality }}</text></view>
        <view class="record-row"><text class="label">提交时间</text><text>{{ formatTime(detail.submittedAt) }}</text></view>
        <view v-if="detail.reviewedAt" class="record-row"><text class="label">审核时间</text><text>{{ formatTime(detail.reviewedAt) }}</text></view>
        <view v-if="detail.expireAt" class="record-row"><text class="label">有效期至</text><text>{{ formatTime(detail.expireAt) }}</text></view>
      </view>

      <view v-if="status !== 'approved' && status !== 'pending'" class="blocked-card">
        <text class="title">暂无法在线提交</text>
        <text class="description">待服务端提供明确的 C 端 KYC 文件上传契约后，将在此页面开放证件资料提交。</text>
      </view>
    </template>
  </view>
</template>

<style lang="scss" scoped>
.kyc-page { min-height: 100%; box-sizing: border-box; padding: 16rpx; background: #f7f8fa; }
.loading { padding: 120rpx 0; text-align: center; color: #86909c; font-size: 24rpx; }
.status-card, .record-card, .blocked-card, .error-card { margin-bottom: 16rpx; padding: 24rpx; border-radius: 16rpx; background: #fff; }
.status-head { display: flex; align-items: center; justify-content: space-between; }
.title { display: block; margin-top: 12rpx; color: #1d2129; font-size: 28rpx; font-weight: 600; }
.description { display: block; margin-top: 12rpx; color: #86909c; font-size: 24rpx; line-height: 1.6; }
.review-remark { display: block; margin-top: 20rpx; padding: 16rpx; border-radius: 8rpx; color: #f53f3f; background: #fff2f0; font-size: 24rpx; line-height: 1.6; }
.record-row { display: flex; justify-content: space-between; gap: 24rpx; padding: 20rpx 0; border-bottom: 1rpx solid #f7f8fa; color: #1d2129; font-size: 24rpx; word-break: break-all; }
.record-row:last-child { border-bottom: 0; }
.label { flex-shrink: 0; color: #86909c; }
</style>
