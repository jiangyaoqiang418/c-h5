<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { fetchKycDetail, fetchKycFileAccess, uploadKycFile } from '@/service/api/kyc';
import KycStatusTag from '@/components/common/kyc-status-tag.vue';
import { useUserStore } from '@/stores';
import { useNavigationGuards } from '@/utils/navigate';
import { UI_ASSETS } from '@/constants/ui-assets';
import { usePageOperation } from '@/utils/page-operation';
import { kycCanApply, kycCreateMessage, kycVersion, readKycCreateReceipt, reconcileKycCreation, startNextKyc, submitKycWithReceipt, type KycCreateReceipt } from '@/utils/kyc-create';

const { requireLogin } = useNavigationGuards();

type UploadField = 'idCardFront' | 'idCardBack' | 'holdingPhoto';
interface UploadedFile { id: Api.RealKyc.Id; url: string; }

const userStore = useUserStore();
const loading = ref(true);
const loadFailed = ref(false);
const detailLoadFailed = ref(false);
const submitting = ref(false);
const uploading = ref<UploadField>();
const receipt = ref<KycCreateReceipt>();
const receiptFailed = ref(false);
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
let loadSequence = 0;
let documentVersion = 0;
watch(() => form.idType, () => {
  documentVersion++;
  form.idCardFront = undefined;
  form.idCardBack = undefined;
  form.holdingPhoto = undefined;
}, { flush: 'sync' });
const page = usePageOperation(() => {
  loadSequence++;
  detail.value = null;
  step.value = 0;
  uploading.value = undefined;
  submitting.value = false;
  receipt.value = undefined;
  receiptFailed.value = false;
  loading.value = false;
  loadFailed.value = true;
  detailLoadFailed.value = false;
  Object.assign(form, { realName: '', idType: 'ID_CARD', idNo: '', nationality: '中国', idCardFront: undefined, idCardBack: undefined, holdingPhoto: undefined });
});

const status = computed<Api.User.KycStatus>(() => {
  if (detail.value?.status === 'PASSED') return kycCanApply(detail.value) ? 'none' : 'approved';
  if (detail.value?.status === 'PENDING') return 'pending';
  if (detail.value?.status === 'REJECTED') return 'rejected';
  return userStore.currentUser?.kycStatus || 'none';
});
const canSubmit = computed(() => !!userStore.currentUser && !formLocked.value && status.value !== 'approved' && status.value !== 'pending' && form.realName.trim().length > 0 && form.idNo.trim().length > 0 && !!form.idCardFront && (form.idType === 'PASSPORT' || !!form.idCardBack));
const formLocked = computed(() => loading.value || loadFailed.value || !!uploading.value || submitting.value || !!receipt.value || receiptFailed.value);
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

function refreshReceipt() {
  try {
    receipt.value = userStore.realUserId ? readKycCreateReceipt(userStore.realUserId) : undefined;
    receiptFailed.value = false;
  } catch { receiptFailed.value = true; }
}
async function load() {
  if (uploading.value || submitting.value || !page.visible.value) return;
  const operation = page.capture();
  const sequence = ++loadSequence;
  const valid = () => operation.isCurrent() && sequence === loadSequence;
  loading.value = true;
  loadFailed.value = false;
  detailLoadFailed.value = false;
  try {
    if (!(await requireLogin('/pages/kyc/index'))) return;
    if (!valid()) return;
    await userStore.init();
    if (!valid() || !userStore.currentUser) return;
    await userStore.refreshProfile();
    if (!valid()) return;
    refreshReceipt();
    if (receiptFailed.value) throw new Error('本机认证提交记录读取失败，请先核对');
    if (receipt.value) {
      await reconcileKycCreation(valid);
      if (!valid()) return;
      refreshReceipt();
    }
    let record: Api.RealKyc.DetailVO | null = null;
    try {
      record = await fetchKycDetail();
      if (!valid()) return;
    } catch (error) {
      if (!valid()) return;
      const currentStatus = userStore.currentUser?.kycStatus;
      if (currentStatus !== 'approved' && currentStatus !== 'pending') throw error;
      detailLoadFailed.value = true;
    }
    if (record) {
      const [front, back, holding] = await Promise.all([
        resolvePrivateFile(record.idCardFrontFileId, record.idCardFront),
        resolvePrivateFile(record.idCardBackFileId, record.idCardBack),
        resolvePrivateFile(record.holdingPhotoFileId, record.holdingPhoto)
      ]);
      if (!valid()) return;
      record = { ...record, idCardFront: front, idCardBack: back, holdingPhoto: holding };
    }
    if (valid()) {
      detail.value = record;
    }
  } catch (error) {
    if (!valid()) return;
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : 'KYC 状态加载失败', icon: 'none' });
  } finally {
    if (operation.sameSession() && sequence === loadSequence) loading.value = false;
  }
}

async function chooseAndUpload(field: UploadField) {
  if (!page.visible.value || !userStore.currentUser || formLocked.value || status.value === 'approved' || status.value === 'pending'
    || (field === 'idCardBack' && form.idType !== 'ID_CARD')) return;
  const operation = page.capture();
  const idType = form.idType;
  const version = documentVersion;
  uploading.value = field;
  try {
    const picked = await uni.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
    if (!operation.afterPicker() || form.idType !== idType || version !== documentVersion) return;
    const path = Array.isArray(picked.tempFilePaths) ? picked.tempFilePaths[0] : picked.tempFilePaths;
    if (!path) return;
    const file = await uploadKycFile(path);
    if (!operation.isCurrent() || form.idType !== idType || version !== documentVersion) return;
    if ((typeof file.id !== 'string' || !file.id.trim()) && (typeof file.id !== 'number' || !Number.isSafeInteger(file.id))) throw new Error('证件上传回执缺少有效文件 ID');
    if (file.scene !== 'KYC' || file.privateAccess !== true) throw new Error('上传回执不是私有认证影像，请重新上传');
    form[field] = { id: file.id, url: file.url };
  } catch (error) {
    if (!operation.isCurrent() || version !== documentVersion) return;
    const message = error instanceof Error ? error.message : String((error as { errMsg?: string })?.errMsg || '证件影像上传失败');
    if (!message.includes('cancel')) uni.showToast({ title: message, icon: 'none' });
  } finally {
    if (operation.sameSession()) uploading.value = undefined;
  }
}

async function submit() {
  if (!page.visible.value || !canSubmit.value || !form.idCardFront) return;
  const operation = page.capture();
  const expectedVersion = kycVersion(detail.value);
  const request = { realName: form.realName.trim(), idType: form.idType, idNo: form.idNo.trim(), nationality: form.nationality.trim() || undefined, idCardFrontFileId: form.idCardFront.id, idCardBackFileId: form.idType === 'ID_CARD' ? form.idCardBack?.id : undefined, holdingPhotoFileId: form.holdingPhoto?.id };
  submitting.value = true;
  try {
    const result = await submitKycWithReceipt(request, expectedVersion, operation.isCurrent);
    if (!operation.sameSession()) return;
    refreshReceipt();
    if (result && operation.isCurrent()) uni.showToast({ title: kycCreateMessage(result), icon: 'none' });
  } catch (error) {
    if (operation.sameSession()) refreshReceipt();
    if (operation.isCurrent()) uni.showToast({ title: receipt.value ? kycCreateMessage(receipt.value) : error instanceof Error ? error.message : '认证提交失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) { submitting.value = false; if (page.visible.value) await load(); }
  }
}
async function startAnother() {
  if (!page.visible.value || loading.value || submitting.value || receiptFailed.value || receipt.value?.state !== 'verified') return;
  const operation = page.capture();
  submitting.value = true;
  try {
    if (!await startNextKyc(receipt.value.attempt, operation.isCurrent) || !operation.isCurrent()) return;
    refreshReceipt();
    Object.assign(form, { realName: '', idType: 'ID_CARD', idNo: '', nationality: '中国', idCardFront: undefined, idCardBack: undefined, holdingPhoto: undefined });
    step.value = 0;
  } catch (error) {
    if (operation.isCurrent()) uni.showToast({ title: error instanceof Error ? error.message : '重新填写失败', icon: 'none' });
  } finally { if (operation.sameSession()) { submitting.value = false; if (page.visible.value) await load(); } }
}

onShow(() => { if (!uploading.value && !submitting.value) load(); });
</script>

<template>
  <view class="kyc-page">
    <view v-if="receipt" class="record-card">
      <text>{{ kycCreateMessage(receipt) }}</text>
      <wd-button block plain :loading="loading" :disabled="submitting" @click="load">核对原认证与审核状态</wd-button>
      <wd-button v-if="receipt.state === 'verified' && detail && kycCanApply(detail)" block plain :disabled="loading || submitting || receiptFailed" @click="startAnother">重新填写认证</wd-button>
    </view>
    <wd-button v-if="receiptFailed" block plain :disabled="submitting" @click="load">原认证记录读取失败，点击重试</wd-button>
    <view v-if="loading" class="loading"><wd-loading size="44rpx" color="var(--yb-brand)" /><text>正在加载认证状态</text></view>
    <view v-else-if="loadFailed" class="error-card"><text class="title">认证状态加载失败</text><text class="description">请检查网络后重新加载。</text><wd-button type="primary" block @click="load">重新加载</wd-button></view>
    <template v-else>
      <view class="status-card" :style="{ backgroundImage: `url(${UI_ASSETS.backgrounds.account})` }"><KycStatusTag :status="status" /><text class="title">{{ statusTitle }}</text><text v-if="detail?.reviewRemark" class="review-remark">审核意见：{{ detail.reviewRemark }}</text><text v-else-if="detailLoadFailed" class="review-remark">历史认证资料暂不可查看，请联系平台处理。</text></view>
      <view v-if="detail" class="record-card">
        <view class="record-row"><text class="label">姓名</text><text>{{ detail.realName || '-' }}</text></view><view class="record-row"><text class="label">证件类型</text><text>{{ detail.idType === 'PASSPORT' ? '护照' : '身份证' }}</text></view><view class="record-row"><text class="label">证件号码</text><text>{{ detail.idNo || '-' }}</text></view><view class="record-row"><text class="label">提交时间</text><text>{{ formatTime(detail.submittedAt) }}</text></view><view v-if="detail.expireAt" class="record-row"><text class="label">有效期至</text><text>{{ formatTime(detail.expireAt) }}</text></view>
        <view v-if="detail.idCardFront || detail.idCardBack || detail.holdingPhoto" class="image-row"><image v-if="detail.idCardFront" :src="detail.idCardFront" mode="aspectFill" /><image v-if="detail.idCardBack" :src="detail.idCardBack" mode="aspectFill" /><image v-if="detail.holdingPhoto" :src="detail.holdingPhoto" mode="aspectFill" /></view>
      </view>
      <view v-if="status !== 'approved' && status !== 'pending'" class="form-card">
        <text class="document-hint">切换证件类型后，需重新上传全部证件影像。</text><wd-steps :active="step"><wd-step title="身份信息" /><wd-step title="证件影像" /><wd-step title="确认提交" /></wd-steps>
        <view v-if="step === 0"><wd-input :disabled="formLocked" v-model="form.realName" label="真实姓名" placeholder="请输入" /><wd-cell title="证件类型"><wd-radio-group :disabled="formLocked" v-model="form.idType" inline><wd-radio value="ID_CARD">身份证</wd-radio><wd-radio value="PASSPORT">护照</wd-radio></wd-radio-group></wd-cell><wd-input :disabled="formLocked" v-model="form.idNo" label="证件号码" placeholder="请输入" /><wd-input :disabled="formLocked" v-model="form.nationality" label="国籍" placeholder="请输入" /></view>
        <view v-else-if="step === 1" class="upload-list"><view class="upload-card" @click="chooseAndUpload('idCardFront')"><text>证件正面</text><image :src="form.idCardFront?.url || UI_ASSETS.placeholders.upload" mode="aspectFill" /><text>{{ uploading === 'idCardFront' ? '上传中…' : '点击选择图片' }}</text></view><view v-if="form.idType === 'ID_CARD'" class="upload-card" @click="chooseAndUpload('idCardBack')"><text>证件反面</text><image :src="form.idCardBack?.url || UI_ASSETS.placeholders.upload" mode="aspectFill" /><text>{{ uploading === 'idCardBack' ? '上传中…' : '点击选择图片' }}</text></view><view class="upload-card" @click="chooseAndUpload('holdingPhoto')"><text>手持证件照（可选）</text><image :src="form.holdingPhoto?.url || UI_ASSETS.placeholders.upload" mode="aspectFill" /><text>{{ uploading === 'holdingPhoto' ? '上传中…' : '点击选择图片' }}</text></view></view>
        <view v-else class="summary"><text>姓名：{{ form.realName }}</text><text>证件号：{{ form.idNo }}</text><text>已上传：{{ (form.idCardFront ? 1 : 0) + (form.idCardBack ? 1 : 0) + (form.holdingPhoto ? 1 : 0) }} 张</text></view>
        <view class="nav-bar"><wd-button v-if="step > 0" :disabled="formLocked" plain @click="step--">上一步</wd-button><wd-button v-if="step < 2" type="primary" :disabled="formLocked || (step === 0 ? !form.realName.trim() || !form.idNo.trim() : !form.idCardFront || (form.idType === 'ID_CARD' && !form.idCardBack))" @click="step++">下一步</wd-button><wd-button v-else type="primary" :disabled="!canSubmit" :loading="submitting" @click="submit">提交认证</wd-button></view>
      </view>
    </template>
  </view>
</template>

<style lang="scss" scoped>
.document-hint { display:block; margin-bottom:20rpx; color:#86909c; font-size:24rpx; }
.kyc-page { min-height: 100%; box-sizing: border-box; padding: 24rpx 24rpx 180rpx; background: var(--yb-bg); }.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:#86909c; }.status-card,.record-card,.form-card,.error-card { margin-bottom:20rpx; padding:24rpx; border-radius:var(--yb-radius-lg); background:#fff; border:1rpx solid var(--yb-border); box-shadow:var(--yb-shadow-card); }.status-card { background-color:#10131f; background-size:cover; background-position:center; color:#fff; }.status-card .title { color:#fff; }.title { display:block; margin-top:12rpx; font-size:28rpx; font-weight:600; color:#1d2129; }.review-remark { display:block; margin-top:16rpx; color:#f53f3f; font-size:24rpx; }.record-row { display:flex; justify-content:space-between; gap:24rpx; padding:18rpx 0; border-bottom:1rpx solid #f2f3f5; font-size:24rpx; }.label { color:#86909c; }.image-row { display:flex; gap:12rpx; margin-top:20rpx; }.image-row image { width:31%; height:160rpx; border-radius:8rpx; }.upload-list { display:flex; flex-direction:column; gap:16rpx; margin-top:24rpx; }.upload-card { min-height:150rpx; padding:16rpx; border:2rpx dashed #c9cdd4; border-radius:var(--yb-radius-md); display:flex; flex-direction:column; gap:12rpx; color:#86909c; font-size:24rpx; }.upload-card image { width:100%; height:220rpx; border-radius:var(--yb-radius-md); }.summary { display:flex; flex-direction:column; gap:16rpx; padding-top:24rpx; font-size:24rpx; }.nav-bar { display:flex; gap:12rpx; margin-top:24rpx; }.nav-bar > * { flex:1; }
</style>
