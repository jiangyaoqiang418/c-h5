<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';

interface Props {
  status: Api.Order.OrderStatus;
}
const props = defineProps<Props>();
const meta = computed(() => enums.ORDER_STATUS_META[props.status]);

const wdType = computed(() => {
  const m: Record<string, string> = {
    green: 'success',
    red: 'danger',
    orange: 'warning',
    gold: 'warning',
    blue: 'primary',
    arcoblue: 'primary',
    cyan: 'primary',
    purple: 'primary',
    gray: 'default'
  };
  return m[meta.value.color] || 'default';
});
</script>

<template>
  <wd-tag :type="wdType" plain round size="small">{{ meta.label }}</wd-tag>
</template>
