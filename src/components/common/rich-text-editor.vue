<script setup lang="ts">
// #ifdef H5
import RichTextEditorH5 from './rich-text-editor-h5.vue';
// #endif
// #ifndef H5
import RichTextEditorApp from './rich-text-editor-app.vue';
// #endif

defineProps<{ modelValue: string; disabled?: boolean }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void; (e: 'uploading', value: boolean): void }>();
</script>

<template>
  <!-- #ifdef H5 -->
  <RichTextEditorH5 :model-value="modelValue" :disabled="disabled" @update:model-value="emit('update:modelValue', $event)" @uploading="emit('uploading', $event)" />
  <!-- #endif -->
  <!-- #ifndef H5 -->
  <RichTextEditorApp :model-value="modelValue" :disabled="disabled" @update:model-value="emit('update:modelValue', $event)" @uploading="emit('uploading', $event)" />
  <!-- #endif -->
</template>
