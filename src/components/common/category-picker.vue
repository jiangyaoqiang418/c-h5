<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CategoryNode } from '@/service/api/category';

const props = defineProps<{
  modelValue: boolean;
  tree: CategoryNode[];
  selectedId?: string;
}>();
const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'select', value: { id: string; name: string }): void;
}>();

const keyword = ref('');
const path = ref<CategoryNode[]>([]);
const currentNodes = computed(() => path.value.length ? path.value[path.value.length - 1].children || [] : props.tree);
const enabledNodes = computed(() => currentNodes.value.filter(node => node.enabled === true));
const current = computed(() => path.value[path.value.length - 1]);

function flatten(nodes: CategoryNode[], parents: string[] = []): Array<{ id: string; name: string }> {
  return nodes.flatMap(node => {
    if (node.enabled !== true || node.level > 5) return [];
    const names = [...parents, node.name];
    return [{ id: String(node.id), name: names.join(' / ') }, ...flatten(node.children || [], names)];
  });
}

const searchResults = computed(() => {
  const value = keyword.value.trim().toLowerCase();
  if (!value) return [];
  return flatten(props.tree).filter(item => item.name.toLowerCase().includes(value)).slice(0, 80);
});

watch(() => props.modelValue, open => {
  if (open) {
    keyword.value = '';
    path.value = [];
  }
});

function close() { emit('update:modelValue', false); }
function enter(node: CategoryNode) {
  if (node.children?.some(child => child.enabled === true) && node.level < 5) path.value.push(node);
  else select({ id: String(node.id), name: [...path.value.map(item => item.name), node.name].join(' / ') });
}
function back(index?: number) {
  if (index === undefined) path.value.pop();
  else path.value = path.value.slice(0, index + 1);
}
function select(item: { id: string; name: string }) {
  emit('select', item);
  close();
}
</script>

<template>
  <wd-popup :model-value="modelValue" position="bottom" :safe-area-inset-bottom="true" @update:model-value="emit('update:modelValue', $event)">
    <view class="picker">
      <view class="head"><text class="title">选择分类</text><text class="close" @click="close">关闭</text></view>
      <wd-input v-model="keyword" clearable placeholder="搜索分类名称" />
      <view v-if="!keyword" class="crumbs">
        <text class="crumb" @click="path = []">全部</text>
        <template v-for="(node, index) in path" :key="node.id">
          <text class="split">/</text><text class="crumb" @click="back(index)">{{ node.name }}</text>
        </template>
      </view>
      <scroll-view scroll-y class="list">
        <template v-if="keyword">
          <wd-cell v-for="item in searchResults" :key="item.id" :title="item.name" clickable @click="select(item)" />
          <view v-if="!searchResults.length" class="empty">没有匹配的分类</view>
        </template>
        <template v-else>
          <wd-cell
            v-if="current"
            :title="`选择当前分类：${current.name}`"
            value="选择"
            clickable
            @click="select({ id: String(current.id), name: path.map(item => item.name).join(' / ') })"
          />
          <wd-cell v-for="node in enabledNodes" :key="node.id" :title="node.name" :value="node.children?.some(child => child.enabled === true) && node.level < 5 ? '下一级' : '选择'" is-link clickable @click="enter(node)" />
          <view v-if="!enabledNodes.length && !current" class="empty">暂无可选分类</view>
        </template>
      </scroll-view>
    </view>
  </wd-popup>
</template>

<style scoped>
.picker { height: 72vh; padding: 24rpx; background: #fff; }
.head { display: flex; justify-content: space-between; align-items: center; padding: 8rpx 12rpx 24rpx; }
.title { font-size: 32rpx; font-weight: 700; }
.close, .crumb { color: var(--yb-brand); font-size: 24rpx; }
.crumbs { display: flex; flex-wrap: wrap; gap: 10rpx; padding: 20rpx 12rpx; }
.split { color: #c9cdd4; }
.list { height: calc(72vh - 190rpx); }
.empty { padding: 80rpx 0; text-align: center; color: #86909c; font-size: 24rpx; }
</style>
