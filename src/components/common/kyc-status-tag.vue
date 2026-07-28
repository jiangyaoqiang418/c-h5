<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';

interface Props {
  status: Api.User.KycStatus;
}
const props = defineProps<Props>();
const meta = computed(() => enums.KYC_STATUS_META[props.status]);
</script>

<template>
  <wd-tag :type="meta.color === 'green' ? 'success' : meta.color === 'red' ? 'danger' : meta.color === 'orange' ? 'warning' : 'primary'" plain size="small">
    KYC · {{ meta.label }}
  </wd-tag>
</template>
