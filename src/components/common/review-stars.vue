<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  score: number;
  mode?: 'readonly' | 'input';
  size?: 'sm' | 'md' | 'lg';
  showScore?: boolean;
}
const props = withDefaults(defineProps<Props>(), { mode: 'readonly', size: 'md', showScore: false });
const emit = defineEmits<{ (e: 'update:score', value: number): void }>();

const stars = [1, 2, 3, 4, 5];
const sizePx = computed(() => ({ sm: 22, md: 32, lg: 48 }[props.size]));

function onClick(i: number) {
  if (props.mode === 'input') emit('update:score', i);
}
</script>

<template>
  <view class="stars" :class="[mode]">
    <text
      v-for="i in stars"
      :key="i"
      class="star"
      :class="{ filled: i <= score }"
      :style="{ fontSize: sizePx + 'rpx' }"
      @click="onClick(i)"
    >
      ★
    </text>
    <text v-if="showScore" class="score">{{ score.toFixed(1) }}</text>
  </view>
</template>

<style lang="scss" scoped>
.stars {
  display: inline-flex;
  align-items: center;
  gap: 4rpx;
}
.stars.input .star {
  padding: 4rpx;
}
.star {
  color: #EDECE6;
  line-height: 1;
  transition: color 0.15s;
}
.star.filled {
  color: #B8935A;
}
.score {
  margin-left: 12rpx;
  font-family: ui-monospace, monospace;
  font-size: 24rpx;
  font-weight: 600;
  color: #B8935A;
}
</style>
