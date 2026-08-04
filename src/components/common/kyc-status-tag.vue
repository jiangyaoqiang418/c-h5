<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';

interface Props {
  status: Api.User.KycStatus;
  light?: boolean;
}
const props = withDefaults(defineProps<Props>(), { light: false });
const meta = computed(() => enums.KYC_STATUS_META[props.status]);
</script>

<template>
  <text v-if="light" class="light-tag">KYC · {{ meta.label }}</text>
  <wd-tag v-else :type="meta.color === 'green' ? 'success' : meta.color === 'red' ? 'danger' : meta.color === 'orange' ? 'warning' : 'primary'" plain size="small">
    KYC · {{ meta.label }}
  </wd-tag>
</template>

<style lang="scss" scoped>
.light-tag {
  flex-shrink: 0;
  color: #fff;
  font-size: 20rpx;
  line-height: 1;
  white-space: nowrap;
}
</style>
