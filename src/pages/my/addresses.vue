<script setup lang="ts">
import { reactive, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { addressApi } from '@shared';
import { parseAddress } from '@/utils/address-parser';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const list = ref<addressApi.AddressRecord[]>([]);
const popupOpen = ref(false);
const smartText = ref('');

const form = reactive({
  receiverName: '',
  receiverPhone: '',
  province: '',
  city: '',
  district: '',
  detail: '',
  isDefault: false
});

async function load() {
  if (!userStore.currentUser) return;
  list.value = await addressApi.fetchMyAddresses(userStore.currentUser.id);
}
onShow(load);

function openNew() {
  Object.assign(form, { receiverName: '', receiverPhone: '', province: '', city: '', district: '', detail: '', isDefault: false });
  smartText.value = '';
  popupOpen.value = true;
}

function applyParsed() {
  if (!smartText.value.trim()) {
    return uni.showToast({ title: '请先粘贴地址文本', icon: 'none' });
  }
  const parsed = parseAddress(smartText.value);
  const hits = Object.keys(parsed).length;
  if (hits === 0) {
    return uni.showToast({ title: '未识别到有效信息，请手动填写', icon: 'none' });
  }
  Object.assign(form, parsed);
  uni.showToast({ title: `已识别 ${hits} 项`, icon: 'success' });
}

async function pasteFromClipboard() {
  try {
    const res = await uni.getClipboardData();
    if (res.data) {
      smartText.value = res.data;
      const parsed = parseAddress(res.data);
      if (Object.keys(parsed).length > 0) {
        Object.assign(form, parsed);
        uni.showToast({ title: '已粘贴并识别', icon: 'success' });
      } else {
        uni.showToast({ title: '已粘贴，请点击"识别"', icon: 'none' });
      }
    }
  } catch {
    uni.showToast({ title: '粘贴失败', icon: 'none' });
  }
}

async function save() {
  if (!userStore.currentUser) return;
  if (!form.receiverName || !/^1\d{10}$/.test(form.receiverPhone)) {
    return uni.showToast({ title: '请检查姓名和手机号', icon: 'none' });
  }
  if (!form.province || !form.city || !form.detail) {
    return uni.showToast({ title: '请填写完整地址', icon: 'none' });
  }
  await addressApi.createAddress({ userId: userStore.currentUser.id, ...form });
  uni.showToast({ title: '已添加', icon: 'success' });
  popupOpen.value = false;
  load();
}

async function setDefault(a: addressApi.AddressRecord) {
  await addressApi.setDefault(a.id);
  load();
}

function onLongPress(a: addressApi.AddressRecord) {
  uni.showActionSheet({
    itemList: ['设为默认', '删除'],
    success: async r => {
      if (r.tapIndex === 0) await addressApi.setDefault(a.id);
      else if (r.tapIndex === 1) await addressApi.deleteAddress(a.id);
      load();
    }
  });
}
</script>

<template>
  <view class="addr-page">
    <view v-if="list.length" class="list">
      <view v-for="a in list" :key="a.id" class="card" @longpress="onLongPress(a)">
        <view class="row">
          <text class="name">{{ a.receiverName }}</text>
          <text class="phone">{{ a.receiverPhone }}</text>
          <wd-tag v-if="a.isDefault" type="primary" size="small">默认</wd-tag>
        </view>
        <text class="addr">{{ a.province }} {{ a.city }} {{ a.district }} {{ a.detail }}</text>
        <view v-if="!a.isDefault" class="set-default" @click="setDefault(a)">设为默认</view>
      </view>
    </view>
    <EmptyState v-else title="暂无地址" />

    <view class="fab" @click="openNew">+ 新增地址</view>

    <wd-popup v-model="popupOpen" position="bottom" :safe-area-inset-bottom="true">
      <view class="popup">
        <text class="popup-title">新增收货地址</text>

        <!-- 智能识别 -->
        <view class="smart-fill">
          <view class="smart-head">
            <text class="smart-title">📋 粘贴地址智能识别</text>
            <text class="smart-hint">支持"姓名 手机 省市区 详细地址"格式</text>
          </view>
          <textarea
            v-model="smartText"
            placeholder="例：张三 13800138000 北京市朝阳区建国路 1 号院 2 栋 3 单元 401"
            :maxlength="200"
            class="smart-area"
          />
          <view class="smart-actions">
            <view class="smart-btn ghost" @click="pasteFromClipboard">
              <text>📋 从剪贴板粘贴</text>
            </view>
            <view class="smart-btn primary" @click="applyParsed">
              <text>识别填入</text>
            </view>
          </view>
        </view>

        <view class="divider"><text>手动填写 / 修改</text></view>

        <wd-input v-model="form.receiverName" label="收件人" placeholder="姓名" />
        <wd-input v-model="form.receiverPhone" label="手机号" placeholder="11 位" />
        <wd-input v-model="form.province" label="省" placeholder="如 上海市" />
        <wd-input v-model="form.city" label="市" placeholder="如 上海市" />
        <wd-input v-model="form.district" label="区" placeholder="如 浦东新区" />
        <wd-textarea v-model="form.detail" placeholder="详细地址" :max-length="80" />
        <wd-cell title="设为默认">
          <wd-switch v-model="form.isDefault" />
        </wd-cell>
        <wd-button type="primary" block class="save-btn" @click="save">保存</wd-button>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
.addr-page { min-height: 100vh; background: #f7f8fa; padding: 16rpx; padding-bottom: 200rpx; }
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
}
.row { display: flex; align-items: center; gap: 16rpx; }
.name { font-size: 28rpx; font-weight: 600; }
.phone { font-size: 24rpx; color: #4e5969; }
.addr { display: block; font-size: 24rpx; color: #4e5969; margin-top: 12rpx; line-height: 1.5; }
.set-default { display: inline-block; margin-top: 16rpx; padding: 8rpx 16rpx; background: #f7f8fa; border-radius: 8rpx; color: #4d80f0; font-size: 22rpx; }
.fab {
  position: fixed; right: 32rpx; bottom: calc(48rpx + env(safe-area-inset-bottom));
  background: #4d80f0; color: #fff;
  padding: 20rpx 32rpx; border-radius: 48rpx;
  font-size: 26rpx;
  box-shadow: 0 8rpx 24rpx rgba(77,128,240,0.4);
}
.popup { padding: 24rpx; max-height: 80vh; overflow-y: auto; }
.popup-title { display: block; font-size: 30rpx; font-weight: 700; padding: 16rpx 24rpx; }

/* 智能识别 */
.smart-fill {
  background: linear-gradient(135deg, #E8F1FF 0%, #F0E8FF 100%);
  border: 1rpx solid #D6E4FF;
  border-radius: 20rpx;
  padding: 24rpx;
  margin: 0 24rpx 24rpx;
}
.smart-head {
  margin-bottom: 16rpx;
}
.smart-title {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: #4D80F0;
}
.smart-hint {
  display: block;
  font-size: 20rpx;
  color: #86909C;
  margin-top: 4rpx;
}
.smart-area {
  width: 100%;
  min-height: 160rpx;
  background: #FFFFFF;
  border: 1rpx solid #D6E4FF;
  border-radius: 12rpx;
  padding: 20rpx;
  font-size: 24rpx;
  color: #0F111A;
  line-height: 1.5;
  box-sizing: border-box;
}
.smart-actions {
  display: flex;
  gap: 12rpx;
  margin-top: 16rpx;
}
.smart-btn {
  flex: 1;
  height: 72rpx;
  border-radius: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24rpx;
  font-weight: 600;
}
.smart-btn.ghost {
  background: #FFFFFF;
  color: #4D80F0;
  border: 1rpx solid #4D80F0;
}
.smart-btn.primary {
  background: #4D80F0;
  color: #FFFFFF;
}

/* Divider */
.divider {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 12rpx 24rpx;
  font-size: 22rpx;
  color: #86909C;
  position: relative;
}
.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1rpx;
  background: #EDECE6;
  margin: 0 16rpx;
}

.save-btn { margin: 24rpx; }
</style>
