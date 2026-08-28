<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';

interface Props {
  level: Api.PurchaseRequest.PushBatchLevel;
}
const props = defineProps<Props>();
const meta = computed(() => enums.PUSH_LEVEL_META[props.level]);
const tagType = computed(() => {
  const m: Record<string, string> = { purple: 'primary', magenta: 'danger', blue: 'primary' };
  return m[meta.value.color] || 'primary';
});
</script>

<template>
  <wd-tag :type="tagType" plain round size="small">{{ meta.label }}</wd-tag>
</template>
