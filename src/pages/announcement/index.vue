<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { cmsApi } from '@shared';
import EmptyState from '@/components/common/empty-state.vue';
import AnnouncementRow from '@/components/cms/announcement-row.vue';

const activeKey = ref<Api.Cms.AnnouncementType | 'all'>('all');
const list = ref<Api.Cms.Announcement[]>([]);
const popupOpen = ref(false);
const detail = ref<Api.Cms.Announcement>();

const TABS: { key: Api.Cms.AnnouncementType | 'all'; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'system', label: '系统' },
  { key: 'maintenance', label: '维护' },
  { key: 'campaign', label: '活动' },
  { key: 'risk', label: '风险' }
];

async function load() {
  const q = activeKey.value === 'all' ? {} : { type: activeKey.value as Api.Cms.AnnouncementType };
  const r = await cmsApi.fetchAnnouncements({ ...q, size: 50 });
  list.value = r.records;
}
onMounted(load);
watch(activeKey, load);

async function openDetail(a: Api.Cms.Announcement) {
  detail.value = await cmsApi.fetchAnnouncementDetail(a.id);
  popupOpen.value = true;
}
</script>

<template>
  <view class="ann-page yb-page">
    <wd-tabs v-model="activeKey" sticky>
      <wd-tab v-for="t in TABS" :key="t.key" :name="t.key" :title="t.label" />
    </wd-tabs>
    <view class="list">
      <view v-if="list.length">
        <AnnouncementRow v-for="a in list" :key="a.id" :announcement="a" @click="openDetail(a)" />
      </view>
      <EmptyState v-else title="暂无公告" />
    </view>

    <wd-popup v-model="popupOpen" position="bottom" :safe-area-inset-bottom="true">
      <view v-if="detail" class="popup">
        <text class="popup-title">{{ detail.title }}</text>
        <text class="popup-meta">{{ detail.type }} · {{ detail.publishAt ? new Date(detail.publishAt).toLocaleString() : '' }}</text>
        <text class="popup-content">{{ detail.body }}</text>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
.ann-page { min-height: 100%; }
.list { padding: 20rpx 24rpx; }
.popup { padding: 32rpx 28rpx calc(32rpx + env(safe-area-inset-bottom)); max-height: 80vh; border-radius: 32rpx 32rpx 0 0; }
.popup-title { display: block; font-size: 32rpx; font-weight: 700; }
.popup-meta { display: block; font-size: 22rpx; color: #86909c; margin: 8rpx 0 24rpx; }
.popup-content { font-size: 26rpx; color: #4e5969; line-height: 1.7; white-space: pre-wrap; }
</style>
