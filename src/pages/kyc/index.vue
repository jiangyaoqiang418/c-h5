<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { fetchKycDetail, fetchKycFileAccess, submitKyc, uploadKycFile } from '@/service/api/kyc';
import KycStatusTag from '@/components/common/kyc-status-tag.vue';
import { useUserStore } from '@/stores';
import { requireLogin } from '@/utils/navigate';
import { UI_ASSETS } from '@/constants/ui-assets';

type UploadField = 'idCardFront' | 'idCardBack' | 'holdingPhoto';
interface UploadedFile { id: Api.RealKyc.Id; url: string; }

const userStore = useUserStore();
const loading = ref(true);
const loadFailed = ref(false);
const detailLoadFailed = ref(false);
const submitting = ref(false);
const uploading = ref<UploadField>();
const detail = ref<Api.RealKyc.DetailVO | null>(null);
const step = ref(0);
const form = reactive({
  realName: '',
  idType: 'ID_CARD' as 'ID_CARD' | 'PASSPORT',
  idNo: '',
  nationality: '中国',
  idCardFront: undefined as UploadedFile | undefined,
  idCardBack: undefined as UploadedFile | undefined,
  holdingPhoto: undefined as UploadedFile | undefined
});

const status = computed<Api.User.KycStatus>(() => {
  if (detail.value?.status === 'PASSED') return 'approved';
  if (detail.value?.status === 'PENDING') return 'pending';
  if (detail.value?.status === 'REJECTED') return 'rejected';
  return userStore.currentUser?.kycStatus || 'none';
});
const canSubmit = computed(() => form.realName.trim().length > 0 && form.idNo.trim().length > 0 && !!form.idCardFront && (form.idType === 'PASSPORT' || !!form.idCardBack));
const statusTitle = computed(() => status.value === 'approved' ? '您已完成 KYC 实名认证' : status.value === 'pending' ? '实名认证审核中' : status.value === 'rejected' ? '实名认证未通过' : '实名认证');

function formatTime(value?: Api.RealKyc.Id): string {
  if (value === undefined || value === null || value === '') return '-';
  const date = typeof value === 'number' ? new Date(value) : /^\d+$/.test(value) ? new Date(Number(value)) : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

async function resolvePrivateFile(fileId?: Api.RealKyc.Id, fallback?: string): Promise<string | undefined> {
  if (fileId !== undefined && fileId !== null) {
    try {
      return (await fetchKycFileAccess(fileId)).url;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

async function load() {
  loading.value = true;
  loadFailed.value = false;
  detailLoadFailed.value = false;
  try {
    if (!(await requireLogin('/pages/kyc/index'))) return;
    await userStore.init();
    if (!userStore.currentUser) return;
    try {
      detail.value = await fetchKycDetail();
    } catch (error) {
      const currentStatus = userStore.currentUser.kycStatus;
      if (currentStatus !== 'approved' && currentStatus !== 'pending') throw error;
      detail.value = null;
      detailLoadFailed.value = true;
    }
    if (detail.value) {
      const [front, back, holding] = await Promise.all([
        resolvePrivateFile(detail.value.idCardFrontFileId, detail.value.idCardFront),
        resolvePrivateFile(detail.value.idCardBackFileId, detail.value.idCardBack),
        resolvePrivateFile(detail.value.holdingPhotoFileId, detail.value.holdingPhoto)
      ]);
      detail.value = { ...detail.value, idCardFront: front, idCardBack: back, holdingPhoto: holding };
    }
  } catch (error) {
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : 'KYC 状态加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function chooseAndUpload(field: UploadField) {
  if (uploading.value) return;
  try {
    const picked = await uni.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
    const path = Array.isArray(picked.tempFilePaths) ? picked.tempFilePaths[0] : picked.tempFilePaths;
    if (!path) return;
    uploading.value = field;
    uni.showLoading({ title: '上传中…' });
    const file = await uploadKycFile(path);
    form[field] = { id: file.id, url: file.url };
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as { errMsg?: string })?.errMsg || '证件影像上传失败');
    if (!message.includes('cancel')) uni.showToast({ title: message, icon: 'none' });
  } finally {
    uploading.value = undefined;
    uni.hideLoading();
  }
}

function submit() {
  if (!canSubmit.value || submitting.value || !form.idCardFront) return;
  uni.showModal({
    title: '确认提交认证',
    content: '提交后将进入平台审核，请确认姓名、证件号和影像资料准确。',
    success: async result => {
      if (!result.confirm || submitting.value || !form.idCardFront) return;
      submitting.value = true;
      try {
        await submitKyc({
          realName: form.realName.trim(),
          idType: form.idType,
          idNo: form.idNo.trim(),
          nationality: form.nationality.trim() || undefined,
          idCardFrontFileId: form.idCardFront.id,
          idCardBackFileId: form.idCardBack?.id,
          holdingPhotoFileId: form.holdingPhoto?.id
        });
        uni.showToast({ title: '认证资料已提交', icon: 'success' });
        await load();
      } catch (error) {
        uni.showToast({ title: error instanceof Error ? error.message : '认证提交失败', icon: 'none' });
      } finally {
        submitting.value = false;
      }
    }
  });
}

onMounted(load);
</script>

<template>
  <view class="kyc-page">
    <view v-if="loading" class="loading">加载中...</view>
    <view v-else-if="loadFailed" class="error-card"><text class="title">认证状态加载失败</text><text class="description">请检查网络后重新加载。</text><wd-button type="primary" block @click="load">重新加载</wd-button></view>
    <template v-else>
      <view class="status-card" :style="{ backgroundImage: `url(${UI_ASSETS.backgrounds.account})` }"><KycStatusTag :status="status" /><text class="title">{{ statusTitle }}</text><text v-if="detail?.reviewRemark" class="review-remark">审核意见：{{ detail.reviewRemark }}</text><text v-else-if="detailLoadFailed" class="review-remark">历史认证资料暂不可查看，请联系平台处理。</text></view>
      <view v-if="detail" class="record-card">
        <view class="record-row"><text class="label">姓名</text><text>{{ detail.realName || '-' }}</text></view><view class="record-row"><text class="label">证件类型</text><text>{{ detail.idType === 'PASSPORT' ? '护照' : '身份证' }}</text></view><view class="record-row"><text class="label">证件号码</text><text>{{ detail.idNo || '-' }}</text></view><view class="record-row"><text class="label">提交时间</text><text>{{ formatTime(detail.submittedAt) }}</text></view><view v-if="detail.expireAt" class="record-row"><text class="label">有效期至</text><text>{{ formatTime(detail.expireAt) }}</text></view>
        <view v-if="detail.idCardFront || detail.idCardBack || detail.holdingPhoto" class="image-row"><image v-if="detail.idCardFront" :src="detail.idCardFront" mode="aspectFill" /><image v-if="detail.idCardBack" :src="detail.idCardBack" mode="aspectFill" /><image v-if="detail.holdingPhoto" :src="detail.holdingPhoto" mode="aspectFill" /></view>
      </view>
      <view v-if="status !== 'approved' && status !== 'pending'" class="form-card">
        <wd-steps :active="step"><wd-step title="身份信息" /><wd-step title="证件影像" /><wd-step title="确认提交" /></wd-steps>
        <view v-if="step === 0"><wd-input v-model="form.realName" label="真实姓名" placeholder="请输入" /><wd-cell title="证件类型"><wd-radio-group v-model="form.idType" inline><wd-radio value="ID_CARD">身份证</wd-radio><wd-radio value="PASSPORT">护照</wd-radio></wd-radio-group></wd-cell><wd-input v-model="form.idNo" label="证件号码" placeholder="请输入" /><wd-input v-model="form.nationality" label="国籍" placeholder="请输入" /></view>
        <view v-else-if="step === 1" class="upload-list"><view class="upload-card" @click="chooseAndUpload('idCardFront')"><text>证件正面</text><image :src="form.idCardFront?.url || UI_ASSETS.placeholders.upload" mode="aspectFill" /><text>{{ uploading === 'idCardFront' ? '上传中…' : '点击选择图片' }}</text></view><view v-if="form.idType === 'ID_CARD'" class="upload-card" @click="chooseAndUpload('idCardBack')"><text>证件反面</text><image :src="form.idCardBack?.url || UI_ASSETS.placeholders.upload" mode="aspectFill" /><text>{{ uploading === 'idCardBack' ? '上传中…' : '点击选择图片' }}</text></view><view class="upload-card" @click="chooseAndUpload('holdingPhoto')"><text>手持证件照（可选）</text><image :src="form.holdingPhoto?.url || UI_ASSETS.placeholders.upload" mode="aspectFill" /><text>{{ uploading === 'holdingPhoto' ? '上传中…' : '点击选择图片' }}</text></view></view>
        <view v-else class="summary"><text>姓名：{{ form.realName }}</text><text>证件号：{{ form.idNo }}</text><text>已上传：{{ (form.idCardFront ? 1 : 0) + (form.idCardBack ? 1 : 0) + (form.holdingPhoto ? 1 : 0) }} 张</text></view>
        <view class="nav-bar"><wd-button v-if="step > 0" plain @click="step--">上一步</wd-button><wd-button v-if="step < 2" type="primary" :disabled="step === 0 ? !form.realName.trim() || !form.idNo.trim() : !form.idCardFront || (form.idType === 'ID_CARD' && !form.idCardBack)" @click="step++">下一步</wd-button><wd-button v-else type="primary" :disabled="!canSubmit" :loading="submitting" @click="submit">提交认证</wd-button></view>
      </view>
    </template>
  </view>
</template>

<style lang="scss" scoped>
.kyc-page { min-height: 100%; box-sizing: border-box; padding: 24rpx 24rpx 180rpx; background: var(--yb-bg); }.loading { padding: 120rpx 0; text-align: center; color: #86909c; }.status-card,.record-card,.form-card,.error-card { margin-bottom:20rpx; padding:24rpx; border-radius:var(--yb-radius-lg); background:#fff; border:1rpx solid var(--yb-border); box-shadow:var(--yb-shadow-card); }.status-card { background-color:#10131f; background-size:cover; background-position:center; color:#fff; }.status-card .title { color:#fff; }.title { display:block; margin-top:12rpx; font-size:28rpx; font-weight:600; color:#1d2129; }.review-remark { display:block; margin-top:16rpx; color:#f53f3f; font-size:24rpx; }.record-row { display:flex; justify-content:space-between; gap:24rpx; padding:18rpx 0; border-bottom:1rpx solid #f2f3f5; font-size:24rpx; }.label { color:#86909c; }.image-row { display:flex; gap:12rpx; margin-top:20rpx; }.image-row image { width:31%; height:160rpx; border-radius:8rpx; }.upload-list { display:flex; flex-direction:column; gap:16rpx; margin-top:24rpx; }.upload-card { min-height:150rpx; padding:16rpx; border:2rpx dashed #c9cdd4; border-radius:var(--yb-radius-md); display:flex; flex-direction:column; gap:12rpx; color:#86909c; font-size:24rpx; }.upload-card image { width:100%; height:220rpx; border-radius:var(--yb-radius-md); }.summary { display:flex; flex-direction:column; gap:16rpx; padding-top:24rpx; font-size:24rpx; }.nav-bar { display:flex; gap:12rpx; margin-top:24rpx; }.nav-bar > * { flex:1; }
</style>
