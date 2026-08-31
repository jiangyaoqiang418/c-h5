<script setup lang="ts">
import { computed, getCurrentInstance, reactive, ref, watch } from 'vue';
import { onHide, onLoad, onShow } from '@dcloudio/uni-app';
import {
  fetchMyAddresses,
  type AddressRecord
} from '@/service/api/address';
import { parseAddress } from '@/utils/address-parser';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { getAccessToken } from '@/service/request/token';
import { usePageOperation } from '@/utils/page-operation';
import { useNavigationGuards } from '@/utils/navigate';
import { addressReceiptMessage, readAddressReceipt, reconcileAddressReceipt, runAddressOperation, validateAddressList, type AddressReceipt } from '@/utils/address-operation';

const { requireLogin } = useNavigationGuards();
const userStore = useUserStore();
const list = ref<AddressRecord[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const popupOpen = ref(false);
const smartText = ref('');
const saving = ref(false);
const selectionMode = ref(false);
const selectedId = ref('');
const receipt = ref<AddressReceipt>();
const receiptFailed = ref(false);
const pageInstance = getCurrentInstance();
let loadSequence = 0;
let formVersion = 0;
let sheetVersion = 0;
const choosing = ref(false);
const blocked = computed(() => saving.value || choosing.value || loading.value || loadFailed.value || receiptFailed.value
  || !!receipt.value && receipt.value.state !== 'verified');
onLoad(query => {
  selectionMode.value = query?.mode === 'select';
  selectedId.value = String(query?.selectedId || '');
});

function chooseAddress(address: AddressRecord) {
  if (!page.visible.value || blocked.value || !selectionMode.value || !userStore.realUserId || !list.value.some(item => String(item.id) === String(address.id))) return;
  const proxy = pageInstance?.proxy as unknown as { getOpenerEventChannel?: () => { emit: (name: string, value: AddressRecord) => void } };
  const channel = proxy?.getOpenerEventChannel?.();
  if (!channel) return uni.showToast({ title: '请从结算页重新选择地址', icon: 'none' });
  channel.emit('selectAddress', address);
  uni.navigateBack();
}

const form = reactive({
  receiverName: '',
  receiverPhone: '',
  province: '',
  city: '',
  district: '',
  detail: '',
  isDefault: false
});
const page = usePageOperation(() => {
  loadSequence++;
  formVersion++;
  sheetVersion++;
  list.value = [];
  popupOpen.value = false;
  smartText.value = '';
  selectedId.value = '';
  receipt.value = undefined;
  receiptFailed.value = false;
  saving.value = false;
  choosing.value = false;
  loading.value = false;
  loadFailed.value = false;
  Object.assign(form, { receiverName: '', receiverPhone: '', province: '', city: '', district: '', detail: '', isDefault: false });
});
watch(popupOpen, () => { formVersion++; }, { flush: 'sync' });

function refreshReceipt() {
  try {
    receipt.value = userStore.realUserId ? readAddressReceipt(userStore.realUserId) : undefined;
    receiptFailed.value = false;
  } catch { receiptFailed.value = true; }
}
function login() {
  return requireLogin(`/pages/my/addresses${selectionMode.value ? `?mode=select&selectedId=${encodeURIComponent(selectedId.value)}` : ''}`);
}

async function load() {
  if (!page.visible.value || saving.value || choosing.value) return;
  const operation = page.capture();
  const sequence = ++loadSequence;
  const current = () => operation.isCurrent() && sequence === loadSequence;
  loading.value = true;
  loadFailed.value = false;
  try {
    await userStore.init();
    if (!current()) return;
    if (!userStore.currentUser) {
      list.value = [];
      if (getAccessToken()) throw new Error('账户资料加载失败，请联网后重试');
      return;
    }
    refreshReceipt();
    const records = validateAddressList(await fetchMyAddresses());
    if (!current()) return;
    if (!receiptFailed.value) {
      try { receipt.value = reconcileAddressReceipt(userStore.realUserId!, records); }
      catch { receiptFailed.value = true; }
    }
    list.value = records;
    if (selectedId.value && !records.some(record => String(record.id) === selectedId.value)) selectedId.value = '';
  } catch (error) {
    if (!current()) return;
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '地址加载失败', icon: 'none' });
  } finally {
    if (operation.sameSession() && sequence === loadSequence) loading.value = false;
  }
}
onShow(load);
onHide(() => {
  loadSequence++;
  formVersion++;
  sheetVersion++;
  loading.value = false;
  choosing.value = false;
  popupOpen.value = false;
});

async function openNew() {
  if (!page.visible.value || blocked.value) return;
  if (!userStore.currentUser) { await login(); return; }
  formVersion++;
  Object.assign(form, { receiverName: '', receiverPhone: '', province: '', city: '', district: '', detail: '', isDefault: false });
  smartText.value = '';
  popupOpen.value = true;
}

function applyParsed() {
  if (!page.visible.value || blocked.value || !popupOpen.value) return;
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
  if (!page.visible.value || blocked.value || !popupOpen.value) return;
  const operation = page.capture();
  const version = formVersion;
  try {
    const res = await uni.getClipboardData();
    if (!operation.isCurrent() || blocked.value || !popupOpen.value || version !== formVersion) return;
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
    if (operation.isCurrent() && version === formVersion) uni.showToast({ title: '粘贴失败', icon: 'none' });
  }
}

async function save() {
  if (!page.visible.value || !popupOpen.value || !userStore.currentUser || blocked.value) return;
  const request = {
    receiverName: form.receiverName.trim(), receiverPhone: form.receiverPhone.trim(),
    province: form.province.trim(), city: form.city.trim(), district: form.district.trim(), detail: form.detail.trim(), isDefault: form.isDefault
  };
  if (!request.receiverName || !/^1\d{10}$/.test(request.receiverPhone)) {
    return uni.showToast({ title: '请检查姓名和手机号', icon: 'none' });
  }
  if (!request.province || !request.city || !request.detail) {
    return uni.showToast({ title: '请填写完整地址', icon: 'none' });
  }
  if ([request.receiverName, request.province, request.city, request.district].some(value => value.length > 64) || request.detail.length > 255) {
    return uni.showToast({ title: '姓名、省市区不能超过 64 字，详细地址不能超过 255 字', icon: 'none' });
  }
  const operation = page.capture();
  const version = formVersion;
  saving.value = true;
  try {
    const result = await runAddressOperation('create', request, operation.isCurrent);
    if (!operation.sameSession()) return;
    refreshReceipt();
    if (!operation.isCurrent() || version !== formVersion || !result) return;
    uni.showToast({ title: addressReceiptMessage(result), icon: 'none' });
    popupOpen.value = false;
  } catch (error) {
    if (operation.sameSession()) refreshReceipt();
    if (operation.isCurrent()) uni.showToast({ title: receipt.value && receipt.value.state !== 'verified' ? addressReceiptMessage(receipt.value) : error instanceof Error ? error.message : '地址添加失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) { saving.value = false; if (page.visible.value) await load(); }
  }
}

async function setDefault(a: AddressRecord) {
  return changeAddress('default', a);
}

async function changeAddress(action: 'default' | 'delete', address: AddressRecord) {
  if (!page.visible.value || blocked.value || !userStore.realUserId || !list.value.some(item => String(item.id) === String(address.id))) return;
  const operation = page.capture();
  saving.value = true;
  try {
    const result = await runAddressOperation(action, { ...address }, operation.isCurrent);
    if (!operation.sameSession()) return;
    refreshReceipt();
    if (operation.isCurrent() && result) uni.showToast({ title: addressReceiptMessage(result), icon: 'none' });
  } catch (error) {
    if (operation.sameSession()) refreshReceipt();
    if (operation.isCurrent()) uni.showToast({ title: receipt.value && receipt.value.state !== 'verified' ? addressReceiptMessage(receipt.value) : error instanceof Error ? error.message : '地址操作失败', icon: 'none' });
  } finally {
    if (operation.sameSession()) { saving.value = false; if (page.visible.value) await load(); }
  }
}

async function onLongPress(a: AddressRecord) {
  if (!page.visible.value || blocked.value || !userStore.realUserId) return;
  const operation = page.capture();
  const version = ++sheetVersion;
  const expected = { ...a };
  choosing.value = true;
  try {
    const result = await uni.showActionSheet({ itemList: ['设为默认', '删除'] });
    if (!operation.isCurrent() || version !== sheetVersion) return;
    choosing.value = false;
    if (result.tapIndex === 0 || result.tapIndex === 1) await changeAddress(result.tapIndex === 0 ? 'default' : 'delete', expected);
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as { errMsg?: string })?.errMsg || '地址操作未完成');
    if (operation.isCurrent() && version === sheetVersion && !message.includes('cancel')) uni.showToast({ title: message, icon: 'none' });
  } finally { if (operation.sameSession() && version === sheetVersion) choosing.value = false; }
}
</script>

<template>
  <view class="addr-page">
    <wd-button v-if="loadFailed" block plain :loading="loading" :disabled="saving || choosing" @click="load">地址加载失败，点击重试</wd-button>
    <view v-if="loading && !list.length" class="loading">地址加载中…</view>
    <view v-else-if="list.length" class="list">
      <view v-for="a in list" :key="a.id" class="card" @longpress="onLongPress(a)" @click="chooseAddress(a)">
        <view class="row">
          <text class="name">{{ a.receiverName }}</text>
          <text class="phone">{{ a.receiverPhone }}</text>
          <wd-tag v-if="a.isDefault" type="primary" round size="small">默认</wd-tag>
          <wd-tag v-if="selectionMode && selectedId === String(a.id)" type="success" size="small">本单已选</wd-tag>
        </view>
        <text class="addr">{{ a.province }} {{ a.city }} {{ a.district }} {{ a.detail }}</text>
        <view v-if="!a.isDefault" class="set-default" @click.stop="setDefault(a)">设为默认</view>
        <view v-if="selectionMode" class="set-default">点击选择此地址（不修改默认地址）</view>
      </view>
    </view>
    <EmptyState v-else-if="loadFailed" title="地址加载失败" description="请重新读取，不代表没有地址" action-text="重试" @action="load" />
    <EmptyState v-else-if="!userStore.currentUser" title="请先登录查看地址" action-text="登录" @action="login" />
    <EmptyState v-else title="暂无地址" />

    <view class="fab" @click="openNew"><wd-icon name="add" size="17px" /><text>新增地址</text></view>

    <wd-popup v-model="popupOpen" position="bottom" :safe-area-inset-bottom="true">
      <view class="popup">
        <text class="popup-title">新增收货地址</text>
        <!-- 智能识别 -->
        <view class="smart-fill">
          <view class="smart-head">
            <view class="smart-title"><wd-icon name="copy" size="16px" /><text>粘贴地址智能识别</text></view>
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
              <wd-icon name="copy" size="15px" /><text>从剪贴板粘贴</text>
            </view>
            <view class="smart-btn primary" @click="applyParsed">
              <text>识别填入</text>
            </view>
          </view>
        </view>

        <view class="divider"><text>手动填写 / 修改</text></view>

        <wd-input v-model="form.receiverName" :disabled="blocked" label="收件人" placeholder="姓名" />
        <wd-input v-model="form.receiverPhone" :disabled="blocked" label="手机号" placeholder="11 位" />
        <wd-input v-model="form.province" :disabled="blocked" label="省" placeholder="如 上海市" />
        <wd-input v-model="form.city" :disabled="blocked" label="市" placeholder="如 上海市" />
        <wd-input v-model="form.district" :disabled="blocked" label="区" placeholder="如 浦东新区" />
        <wd-textarea v-model="form.detail" :disabled="blocked" placeholder="详细地址" :max-length="80" />
        <wd-cell title="设为默认">
          <wd-switch v-model="form.isDefault" :disabled="blocked" />
        </wd-cell>
        <wd-button type="primary" block class="save-btn" :loading="saving" :disabled="blocked" @click="save">保存</wd-button>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
.addr-page { min-height: 100%; background: var(--yb-bg); padding: 20rpx 24rpx; padding-bottom: calc(144rpx + env(safe-area-inset-bottom)); }
.loading { padding: 80rpx 0; text-align: center; color: #86909c; font-size: 24rpx; }
.card {
  background: #fff;
  border:1rpx solid var(--yb-border); border-radius:var(--yb-radius-lg); box-shadow:var(--yb-shadow-card);
  padding: 24rpx;
  margin-bottom: 16rpx;
}
.row { display: flex; align-items: center; gap: 16rpx; }
.name { font-size: 28rpx; font-weight: 600; }
.phone { font-size: 24rpx; color: #4e5969; }
.addr { display: block; font-size: 24rpx; color: #4e5969; margin-top: 12rpx; line-height: 1.5; }
.set-default { display: inline-block; margin-top: 16rpx; padding: 8rpx 16rpx; background: #fff1f2; border-radius: 8rpx; color: var(--yb-brand); font-size: 22rpx; }
.fab {
  position: fixed; right: 28rpx; bottom: calc(28rpx + env(safe-area-inset-bottom));
  display:flex; align-items:center; gap:8rpx;
  background: var(--yb-brand); color: #fff;
  padding: 20rpx 32rpx; border-radius: 48rpx;
  font-size: 26rpx;
  box-shadow: 0 8rpx 24rpx rgba(250,36,60,0.28);
}
.popup { padding: 24rpx; max-height: 80vh; overflow-y: auto; }
.popup-title { display: block; font-size: 30rpx; font-weight: 700; padding: 16rpx 24rpx; }

/* 智能识别 */
.smart-fill {
  background: linear-gradient(135deg, #fff2f2 0%, #f8f1ea 100%);
  border: 1rpx solid #f0d8d5;
  border-radius: 20rpx;
  padding: 24rpx;
  margin: 0 24rpx 24rpx;
}
.smart-head {
  margin-bottom: 16rpx;
}
.smart-title {
  display:flex;
  align-items:center;
  gap:8rpx;
  font-size: 26rpx;
  font-weight: 700;
  color: var(--yb-brand);
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
  border: 1rpx solid var(--yb-border);
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
.smart-btn.ghost { gap:8rpx; }
.smart-btn.ghost {
  background: #FFFFFF;
  color: var(--yb-brand);
  border: 1rpx solid var(--yb-brand);
}
.smart-btn.primary {
  background: var(--yb-brand);
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
