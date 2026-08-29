<script setup lang="ts">
import { ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { go } from '@/utils/navigate';
import PurchaseRequestCard from '@/components/purchase/purchase-request-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';
import { cancelPurchase, fetchMyPurchases } from '@/service/api/purchase';
import { UI_ASSETS } from '@/constants/ui-assets';

const userStore = useUserStore();
const activeKey = ref('all');
const list = ref<Api.PurchaseRequest.PurchaseRequest[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
let loadToken = 0;

const TABS: { key: string; label: string; statuses?: Api.PurchaseRequest.RequestStatus[] }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待审核', statuses: ['pending_audit'] },
  { key: 'pushing', label: '推送中', statuses: ['pushing'] },
  { key: 'claimed', label: '已接单', statuses: ['claimed'] },
  { key: 'rejected', label: '已驳回', statuses: ['rejected'] },
  { key: 'cancelled', label: '已取消', statuses: ['cancelled'] }
];

async function load() {
  const token = ++loadToken;
  loading.value = true;
  loadFailed.value = false;
  try {
    await userStore.init();
    if (!userStore.realUserId) {
      if (token === loadToken) list.value = [];
      return;
    }
    const tab = TABS.find(t => t.key === activeKey.value);
    const r = await fetchMyPurchases(userStore.realUserId, tab?.statuses);
    if (token === loadToken) list.value = r.records;
  } catch (error) {
    if (token !== loadToken) return;
    list.value = [];
    loadFailed.value = true;
    uni.showToast({ title: error instanceof Error ? error.message : '求购列表加载失败', icon: 'none' });
  } finally {
    if (token === loadToken) loading.value = false;
  }
}
onShow(load);
watch(activeKey, load);

function onCancel(req: Api.PurchaseRequest.PurchaseRequest) {
  uni.showModal({
    title: '撤销求购？',
    success: async r => {
      if (r.confirm) {
        try {
          await cancelPurchase(req.id);
          load();
        } catch (error) {
          uni.showToast({ title: error instanceof Error ? error.message : '撤销失败', icon: 'none' });
        }
      }
    }
  });
}
</script>

<template>
  <view class="my-purchase-page yb-page yb-page--full-bleed">
    <view class="hero" :style="{ backgroundImage: `url(${UI_ASSETS.backgrounds.purchase})` }">
      <text class="hero-eyebrow">MY PURCHASE REQUESTS</text>
      <text class="hero-title">我的求购</text>
      <text class="hero-sub">跟踪状态 · 接单进度 · 关联订单</text>
    </view>
    <view class="yb-sticky-tabs-frame">
      <wd-tabs v-model="activeKey">
        <wd-tab v-for="t in TABS" :key="t.key" :name="t.key" :title="t.label" />
      </wd-tabs>
    </view>
    <view class="list">
      <view v-if="loading" class="loading"><wd-loading size="44rpx" /><text>正在加载求购</text></view>
      <view v-else-if="list.length">
        <PurchaseRequestCard v-for="r in list" :key="r.id" :request="r" mode="mine" @cancel="onCancel" />
      </view>
      <EmptyState v-else-if="loadFailed" title="求购列表加载失败" description="请稍后重试" />
      <EmptyState
        v-else
        title="暂无求购"
        description="发起求购让全球买手为您代购"
        action-text="发起求购"
        @action="go('/pages/purchase/create')"
      />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.my-purchase-page { min-height:100%; }
.hero {
  background-color: #10131f;
  background-size: cover;
  background-position:center;
  color:#fff;
  padding: 44rpx 28rpx 32rpx;
}
.hero-eyebrow {
  display: block;
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 3rpx;
  color: rgba(255,255,255,.64);
  margin-bottom: 12rpx;
}
.hero-title {
  display: block;
  font-size: 44rpx;
  font-weight: 700;
  color: #fff;
  letter-spacing: -1rpx;
}
.hero-sub {
  display: block;
  font-size: 24rpx;
  color: rgba(255,255,255,.76);
  margin-top: 8rpx;
}
.list { padding:24rpx; }
.loading { display:flex; flex-direction:column; align-items:center; padding:120rpx 0; gap:16rpx; color:var(--yb-muted); font-size:var(--yb-fs-body-sm); }
</style>
