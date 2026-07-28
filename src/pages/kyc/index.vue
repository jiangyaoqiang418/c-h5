<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { kycApi } from '@shared';
import { goBack } from '@/utils/navigate';
import KycStatusTag from '@/components/common/kyc-status-tag.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const step = ref(0);
const submitting = ref(false);
const status = ref<Api.User.KycStatus>('none');
const submission = ref<Api.Kyc.Submission>();

const form = reactive({
  realName: '',
  idNumber: '',
  phone: '',
  idCardFront: '',
  idCardBack: '',
  faceImage: ''
});

const STEPS = [
  { title: '身份信息', detail: '真实姓名 + 证件号' },
  { title: '证件照片', detail: '正反面' },
  { title: '人脸识别', detail: '本人手持证件' },
  { title: '联系方式', detail: '手机号验证' }
];

onMounted(async () => {
  if (!userStore.currentUser) return;
  const r = await kycApi.fetchMyKycStatus(userStore.currentUser.id);
  status.value = r.status;
  submission.value = r.submission;
});

function fieldOf(code: string): string {
  const f = submission.value?.fields.find(x => x.fieldCode === code);
  if (f) {
    const v = String(f.value);
    if (code === 'idNumber' && v.length > 8) return v.slice(0, 4) + '****' + v.slice(-4);
    if (code === 'realName' && v.length > 1) return v.slice(0, 1) + '*'.repeat(v.length - 1);
    return v;
  }
  if (status.value !== 'approved') return '—';
  // fallback
  const u = userStore.currentUser;
  if (!u) return '—';
  if (code === 'realName') return u.nickname.slice(0, 1) + '*'.repeat(Math.max(1, u.nickname.length - 1));
  if (code === 'phone') return u.phone ? u.phone.slice(0, 3) + '****' + u.phone.slice(-4) : '—';
  if (code === 'idNumber') {
    const seed = (u.id * 137 + 31).toString().padStart(4, '0').slice(-4);
    return `3101${'*'.repeat(10)}${seed}`;
  }
  return '—';
}

const canNext = computed(() => {
  if (step.value === 0) return form.realName.length >= 2 && /^\d{15,18}[\dXx]?$/.test(form.idNumber);
  if (step.value === 1) return !!form.idCardFront && !!form.idCardBack;
  if (step.value === 2) return !!form.faceImage;
  if (step.value === 3) return /^1\d{10}$/.test(form.phone);
  return false;
});

async function upload(field: 'idCardFront' | 'idCardBack' | 'faceImage') {
  uni.showLoading({ title: '上传中…' });
  await new Promise(r => setTimeout(r, 800));
  form[field] = `https://picsum.photos/seed/kyc-${field}-${Date.now()}/400/250`;
  uni.hideLoading();
}

async function submit() {
  if (!userStore.currentUser) return;
  submitting.value = true;
  try {
    const r = await kycApi.submitKycMock({
      userId: userStore.currentUser.id,
      ...form
    });
    if (r.ok) {
      uni.showToast({ title: '已提交，等待审核', icon: 'success' });
      status.value = 'pending';
      setTimeout(goBack, 1200);
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <view class="kyc-page">
    <!-- 已通过：卡片展示 + 无表单 -->
    <view v-if="status === 'approved'" class="approved-card">
      <view class="approved-head">
        <text class="ok-icon">✅</text>
        <view>
          <KycStatusTag :status="status" />
          <text class="approved-title">您已完成 KYC 实名认证</text>
          <text class="approved-sub">有效期至 {{ submission?.expiresAt ? new Date(submission.expiresAt).toLocaleDateString() : '永久' }}</text>
        </view>
      </view>
      <view class="kv-list">
        <view class="kv"><text class="k">姓名</text><text class="v">{{ fieldOf('realName') }}</text></view>
        <view class="kv"><text class="k">身份证号</text><text class="v">{{ fieldOf('idNumber') }}</text></view>
        <view class="kv"><text class="k">手机号</text><text class="v">{{ fieldOf('phone') }}</text></view>
        <view class="kv"><text class="k">受众类型</text><text class="v">{{ userStore.currentUser?.isBuyer ? '买手' : '顾客' }}</text></view>
      </view>
      <text class="foot-tip">原型演示：审核信息已归档，无需重新提交</text>
    </view>

    <!-- 未通过：提示 + 步骤表单 -->
    <template v-else>
      <view v-if="status !== 'none'" class="status-bar">
        <text>当前状态：</text>
        <KycStatusTag :status="status" />
      </view>

      <wd-steps :active="step">
        <wd-step v-for="(s, i) in STEPS" :key="i" :title="s.title" :description="s.detail" />
      </wd-steps>

      <view class="content">
        <view v-if="step === 0" class="form">
          <wd-input v-model="form.realName" label="真实姓名" placeholder="请输入" />
          <wd-input v-model="form.idNumber" label="证件号码" placeholder="身份证号" />
        </view>

        <view v-if="step === 1" class="form">
          <view class="up-row" @click="upload('idCardFront')">
            <text class="up-lbl">证件正面</text>
            <image v-if="form.idCardFront" :src="form.idCardFront" mode="aspectFit" class="up-img" />
            <text v-else class="up-hint">点击上传</text>
          </view>
          <view class="up-row" @click="upload('idCardBack')">
            <text class="up-lbl">证件反面</text>
            <image v-if="form.idCardBack" :src="form.idCardBack" mode="aspectFit" class="up-img" />
            <text v-else class="up-hint">点击上传</text>
          </view>
        </view>

        <view v-if="step === 2" class="form">
          <view class="up-row" @click="upload('faceImage')">
            <text class="up-lbl">人脸识别</text>
            <image v-if="form.faceImage" :src="form.faceImage" mode="aspectFit" class="up-img" />
            <text v-else class="up-hint">点击拍照（模拟）</text>
          </view>
        </view>

        <view v-if="step === 3" class="form">
          <wd-input v-model="form.phone" label="手机号" placeholder="11 位手机号" />
        </view>
      </view>

      <view class="nav-bar">
        <wd-button v-if="step > 0" plain @click="step--">上一步</wd-button>
        <wd-button v-if="step < 3" type="primary" :disabled="!canNext" @click="step++">下一步</wd-button>
        <wd-button v-else type="primary" :disabled="!canNext" :loading="submitting" @click="submit">提交</wd-button>
      </view>
    </template>
  </view>
</template>

<style lang="scss" scoped>
.kyc-page { min-height: 100vh; background: #f7f8fa; padding: 16rpx; padding-bottom: 200rpx; }
.approved-card { background: #fff; border-radius: 16rpx; padding: 32rpx; }
.approved-head { display: flex; gap: 20rpx; align-items: center; padding-bottom: 24rpx; border-bottom: 1rpx solid #f2f3f5; }
.ok-icon { font-size: 72rpx; }
.approved-title { display: block; font-size: 30rpx; font-weight: 700; margin-top: 8rpx; }
.approved-sub { display: block; font-size: 22rpx; color: #86909c; margin-top: 4rpx; }
.kv-list { padding: 16rpx 0; }
.kv { display: flex; justify-content: space-between; padding: 16rpx 0; border-bottom: 1rpx solid #f7f8fa; font-size: 26rpx; }
.k { color: #86909c; }
.v { color: #1d2129; font-family: ui-monospace, monospace; }
.foot-tip { display: block; text-align: center; color: #c9cdd4; font-size: 22rpx; margin-top: 16rpx; }
.status-bar { background: #fff; padding: 24rpx; border-radius: 16rpx; margin-bottom: 16rpx; display: flex; align-items: center; gap: 16rpx; font-size: 26rpx; }
.content { background: #fff; border-radius: 16rpx; padding: 32rpx; margin-top: 16rpx; min-height: 400rpx; }
.up-row { padding: 24rpx 0; }
.up-lbl { display: block; font-size: 28rpx; margin-bottom: 12rpx; }
.up-img { width: 100%; height: 320rpx; border-radius: 16rpx; background: #f7f8fa; }
.up-hint {
  display: block;
  height: 200rpx;
  background: #f7f8fa;
  border: 2rpx dashed #c9cdd4;
  border-radius: 16rpx;
  text-align: center;
  line-height: 200rpx;
  color: #86909c;
  font-size: 26rpx;
}
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
