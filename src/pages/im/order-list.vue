<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { imApi } from '@shared';
import ConversationRow from '@/components/im/conversation-row.vue';
import EmptyState from '@/components/common/empty-state.vue';
import { useUserStore } from '@/stores';

const userStore = useUserStore();
const groups = ref<Api.Im.OrderGroup[]>([]);
const loading = ref(false);

async function load() {
  if (!userStore.currentUser) return;
  loading.value = true;
  try {
    groups.value = await imApi.fetchMyOrderGroups(userStore.currentUser.id);
  } finally {
    loading.value = false;
  }
}

onShow(load);
</script>

<template>
  <view class="list-page">
    <view v-if="groups.length" class="list">
      <ConversationRow v-for="g in groups" :key="g.orderId" :group="g" />
    </view>
    <EmptyState v-else-if="!loading" title="暂无订单群聊" description="下单后会自动创建 买手-顾客-平台 三方群" />
  </view>
</template>

<style lang="scss" scoped>
.list-page {
  min-height: 100%;
  background: #FAFAF7;
  padding: 16rpx;
}
</style>
