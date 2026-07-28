<script setup lang="ts">
import { ref, watch } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { aftersaleApi } from '@shared';
import AftersaleCard from '@/components/aftersale/aftersale-card.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const activeKey = ref('all');
const list = ref<Api.Order.AftersaleCase[]>([]);

const TABS: { key: string; label: string; statuses?: Api.Order.AftersaleStatus[] }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待响应', statuses: ['pending', 'shopper_agreed', 'shopper_rejected'] },
  { key: 'arbitrating', label: '仲裁中', statuses: ['arbitrating'] },
  { key: 'executing', label: '执行中', statuses: ['executing'] },
  { key: 'completed', label: '已完成', statuses: ['completed'] }
];

async function load() {
  if (!userStore.currentUser) return;
  const tab = TABS.find(t => t.key === activeKey.value);
  const r = await aftersaleApi.fetchMyAftersales({
    customerId: userStore.currentUser.id,
    statuses: tab?.statuses,
    size: 30
  });
  list.value = r.records;
}
onShow(load);
watch(activeKey, load);

function onCancel(c: Api.Order.AftersaleCase) {
  uni.showModal({
    title: '撤销售后？',
    success: async r => {
      if (r.confirm) {
        await aftersaleApi.cancelAftersaleMock(c.id);
        load();
      }
    }
  });
}
</script>

<template>
  <view class="as-list-page">
    <wd-tabs v-model="activeKey" sticky>
      <wd-tab v-for="t in TABS" :key="t.key" :name="t.key" :title="t.label" />
    </wd-tabs>
    <view class="list">
      <view v-if="list.length">
        <AftersaleCard v-for="c in list" :key="c.id" :case-record="c" @cancel="onCancel" />
      </view>
      <EmptyState v-else title="暂无售后工单" description="完成订单后如遇问题可申请售后" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
.as-list-page { min-height: 100vh; background: #f7f8fa; }
.list { padding: 16rpx; }
</style>
