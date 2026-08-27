<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  announcement: Api.Cms.Announcement;
}
const props = defineProps<Props>();
defineEmits<{ (e: 'open', a: Api.Cms.Announcement): void }>();

const TYPE_META: Record<Api.Cms.AnnouncementType, { label: string; color: string; icon: string }> = {
  system: { label: '系统', color: 'primary', icon: 'notification' },
  maintenance: { label: '维护', color: 'warning', icon: 'setting' },
  campaign: { label: '活动', color: 'danger', icon: 'gift' },
  risk: { label: '风险', color: 'default', icon: 'warning' }
};
const meta = computed(() => TYPE_META[props.announcement.type]);
</script>

<template>
  <view class="ann-row" :class="{ pinned: announcement.pinned }" @click="$emit('open', announcement)">
    <view class="head">
      <wd-icon :name="meta.icon" size="28rpx" color="var(--yb-brand)" />
      <wd-tag :type="meta.color" plain size="small">{{ meta.label }}</wd-tag>
      <wd-tag v-if="announcement.pinned" type="danger" size="small">置顶</wd-tag>
    </view>
    <text class="title">{{ announcement.title }}</text>
    <text class="summary">{{ announcement.summary }}</text>
    <view class="meta">
      <text>{{ new Date(announcement.publishAt || announcement.createdAt).toLocaleDateString() }}</text>
      <text>{{ announcement.viewsCount.toLocaleString() }} 浏览</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.ann-row {
  background: #fff;
  border-radius: var(--yb-radius-lg);
  padding: 24rpx;
  margin-bottom: 16rpx;
  border: 1rpx solid var(--yb-border);
  border-left: 6rpx solid var(--yb-border);
  box-shadow: var(--yb-shadow-card);
}
.ann-row.pinned {
  border-left-color: var(--yb-brand);
  background: linear-gradient(105deg, #fff1f2 0%, #fff 42%);
}
.head {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-bottom: 12rpx;
}
.title {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 8rpx;
}
.summary {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 24rpx;
  color: #4e5969;
  line-height: 1.5;
  margin-bottom: 12rpx;
}
.meta {
  display: flex;
  justify-content: space-between;
  font-size: 20rpx;
  color: #86909c;
}
</style>
