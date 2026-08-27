<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { applyBuyer } from '@/service/api/buyer';
import { useUserStore } from '@/stores';
import { go, requireLogin } from '@/utils/navigate';

const userStore = useUserStore();
const loading = ref(true);
const submitting = ref(false);

const form = reactive<Api.RealUser.BuyerApplyParams>({
  realName: '',
  contact: '',
  reason: ''
});

const application = computed(() => userStore.buyerApplication);
const canApply = computed(() => !application.value || application.value.status === 'REJECTED');
const canSubmit = computed(() => (
  form.realName.trim().length > 0
  && form.contact.trim().length > 0
  && form.reason.trim().length >= 10
  && form.reason.trim().length <= 500
));

const statusMeta = computed(() => {
  if (application.value?.status === 'PENDING') {
    return { label: '审核中', className: 'pending', detail: '申请已提交，请等待平台审核。' };
  }
  if (application.value?.status === 'APPROVED') {
    return { label: '已通过', className: 'approved', detail: '买手申请已通过。' };
  }
  if (application.value?.status === 'REJECTED') {
    return { label: '未通过', className: 'rejected', detail: '请根据审核意见修改后重新提交。' };
  }
  return undefined;
});

function formatTime(value?: string | number): string {
  if (value === undefined || value === null || value === '') return '';
  const date = typeof value === 'number'
    ? new Date(value)
    : /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function fillForm() {
  const record = application.value;
  form.realName = record?.realName || '';
  form.contact = record?.contact || userStore.currentUser?.phone || '';
  form.reason = record?.status === 'REJECTED' ? record.reason || '' : '';
}

async function load() {
  loading.value = true;
  try {
    if (!(await requireLogin('/pages/buyer/apply'))) return;
    await userStore.refreshBuyerApplication();
    if (userStore.buyerApplicationLoadFailed) {
      uni.showToast({ title: '买手申请状态加载失败', icon: 'none' });
      return;
    }
    fillForm();
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!canSubmit.value) {
    uni.showToast({ title: '请填写姓名、联系方式和不少于 10 字的申请说明', icon: 'none' });
    return;
  }
  uni.showModal({
    title: application.value?.status === 'REJECTED' ? '确认重新提交' : '确认提交申请',
    content: '提交后将进入平台审核，请确认联系方式准确。',
    confirmText: '确认提交',
    success: async result => {
      if (!result.confirm) return;
      submitting.value = true;
      try {
        const id = await applyBuyer({
          realName: form.realName.trim(),
          contact: form.contact.trim(),
          reason: form.reason.trim()
        });
        await userStore.refreshBuyerApplication();
        uni.showToast({ title: `申请已提交（${id}）`, icon: 'success' });
      } catch (error) {
        uni.showToast({ title: error instanceof Error ? error.message : '买手申请提交失败', icon: 'none' });
      } finally {
        submitting.value = false;
      }
    }
  });
}

onMounted(load);
</script>

<template>
  <view class="apply-page yb-page">
    <view v-if="loading" class="loading"><wd-loading size="44rpx" color="var(--yb-brand)" /><text>正在加载申请状态</text></view>

    <template v-else-if="!userStore.buyerApplicationLoadFailed">
      <view v-if="statusMeta" class="status-card">
        <view class="status-head">
          <text class="status-title">申请状态</text>
          <text class="status-tag" :class="statusMeta.className">{{ statusMeta.label }}</text>
        </view>
        <text class="status-detail">{{ statusMeta.detail }}</text>
        <view v-if="application" class="record-list">
          <view class="record-row"><text class="record-label">真实姓名</text><text>{{ application.realName || '-' }}</text></view>
          <view class="record-row"><text class="record-label">联系方式</text><text>{{ application.contact || '-' }}</text></view>
          <view class="record-row"><text class="record-label">申请时间</text><text>{{ formatTime(application.appliedAt) || '-' }}</text></view>
          <view v-if="application.reviewRemark" class="review-row">
            <text class="record-label">审核意见</text>
            <text class="review-text">{{ application.reviewRemark }}</text>
          </view>
        </view>
        <wd-button
          v-if="application?.status === 'APPROVED' && userStore.currentUser?.kycStatus !== 'approved'"
          type="primary"
          block
          class="status-action"
          @click="go('/pages/kyc/index')"
        >
          前往 KYC 认证
        </wd-button>
      </view>

      <view v-if="canApply" class="form-card">
        <text class="form-title">{{ application?.status === 'REJECTED' ? '重新提交申请' : '申请成为买手' }}</text>
        <text class="form-tip">请填写真实信息，申请说明不少于 10 字。</text>
        <wd-input v-model="form.realName" label="真实姓名" placeholder="请输入真实姓名" />
        <wd-input v-model="form.contact" label="联系方式" placeholder="手机号、邮箱或其他联系方式" />
        <wd-textarea
          v-model="form.reason"
          label="申请说明"
          placeholder="请说明您的采购经验、擅长品类或服务优势"
          :max-length="500"
          show-word-limit
        />
        <wd-button type="primary" block :disabled="!canSubmit" :loading="submitting" class="submit-btn" @click="submit">
          {{ application?.status === 'REJECTED' ? '重新提交' : '提交申请' }}
        </wd-button>
      </view>
    </template>

    <view v-else class="error-card">
      <text class="error-title">申请状态加载失败</text>
      <text class="error-detail">请检查网络后重试。</text>
      <wd-button type="primary" block @click="load">重新加载</wd-button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.apply-page {
  min-height: 100%;
  box-sizing: border-box;
  padding: 24rpx;
}
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 0;
  gap: 16rpx;
  text-align: center;
  color: #86909c;
  font-size: 24rpx;
}
.status-card, .form-card, .error-card {
  background: #fff;
  border-radius: var(--yb-radius-lg);
  padding: 24rpx;
  margin-bottom: 20rpx;
  border:1rpx solid var(--yb-border);
  box-shadow:var(--yb-shadow-card);
}
.status-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.status-title, .form-title, .error-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1d2129;
}
.status-tag {
  padding: 6rpx 16rpx;
  border-radius: 8rpx;
  font-size: 22rpx;
}
.status-tag.pending {
  color: #ff7d00;
  background: #fff7e6;
}
.status-tag.approved {
  color: #00b42a;
  background: #e8ffea;
}
.status-tag.rejected {
  color: #f53f3f;
  background: #ffece8;
}
.status-detail, .form-tip, .error-detail {
  display: block;
  margin: 12rpx 0 20rpx;
  color: #86909c;
  font-size: 24rpx;
  line-height: 1.6;
}
.record-list {
  border-top: 1rpx solid #f2f3f5;
}
.record-row {
  display: flex;
  justify-content: space-between;
  gap: 24rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #f7f8fa;
  font-size: 24rpx;
  color: #1d2129;
}
.record-label {
  flex-shrink: 0;
  color: #86909c;
}
.review-row {
  padding: 20rpx 0;
}
.review-text {
  display: block;
  margin-top: 10rpx;
  color: #1d2129;
  font-size: 24rpx;
  line-height: 1.6;
}
.status-action, .submit-btn {
  margin-top: 24rpx;
}
</style>
