<script setup lang="ts">
import { getCurrentInstance, nextTick, ref, watch } from 'vue';
import { uploadProductImage } from '@/service/api/product';
import { sanitizeRichText } from '@/utils/rich-text';

const props = withDefaults(defineProps<{ modelValue: string; disabled?: boolean }>(), { disabled: false });
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void; (e: 'uploading', value: boolean): void }>();
const instance = getCurrentInstance();
const editorContext = ref<any>();
const uploading = ref(false);
const moreTools = ref(false);
const formatStates = ref<Record<string, unknown>>({});
let ready = false;
let currentHtml = sanitizeRichText(props.modelValue);

function onReady() {
  uni.createSelectorQuery().in(instance?.proxy).select('#product-rich-editor').context(result => {
    editorContext.value = (result as any)?.context;
    ready = true;
    editorContext.value?.setContents({ html: currentHtml });
  }).exec();
}
function format(name: string, value?: string) { if (!props.disabled) editorContext.value?.format(name, value); }
function onInput(event: any) { currentHtml = sanitizeRichText(event.detail?.html || ''); emit('update:modelValue', currentHtml); }
function onStatusChange(event: { detail?: Record<string, unknown> }) { formatStates.value = event.detail || {}; }
watch(() => props.modelValue, async value => {
  if (!ready) return;
  const next = sanitizeRichText(value);
  if (next === currentHtml) return;
  currentHtml = next;
  await nextTick();
  editorContext.value?.setContents({ html: currentHtml });
});

async function insertImage() {
  if (props.disabled || uploading.value) return;
  if ((props.modelValue.match(/<img\b/gi) || []).length >= 30) return uni.showToast({ title: '详情最多插入 30 张图片', icon: 'none' });
  try {
    const selected = await uni.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
    const path = Array.isArray(selected.tempFilePaths) ? selected.tempFilePaths[0] : selected.tempFilePaths;
    if (!path) return;
    uploading.value = true; emit('uploading', true);
    const uploaded = await uploadProductImage(path);
    editorContext.value?.insertImage({ src: uploaded.url || uploaded.filePath, alt: '商品详情图片' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as { errMsg?: string })?.errMsg || '图片上传失败');
    if (!message.includes('cancel')) uni.showToast({ title: message, icon: 'none' });
  } finally { uploading.value = false; emit('uploading', false); }
}
async function setLink() {
  if (props.disabled) return;
  const result = await uni.showModal({ title: '插入链接', placeholderText: 'https://', editable: true });
  if (!result.confirm) return;
  const href = String(result.content || '').trim();
  if (!/^(https?:\/\/|mailto:)/i.test(href)) return uni.showToast({ title: '请输入 http、https 或 mailto 链接', icon: 'none' });
  editorContext.value?.format('link', href);
}
</script>

<template>
  <view class="rich-editor" :class="{ disabled }">
    <view class="toolbar">
      <button size="mini" :class="{ active: formatStates.bold === true }" :aria-pressed="formatStates.bold === true" @click="format('bold')">加粗</button><button size="mini" :class="{ active: formatStates.header === 2 || formatStates.header === 'H2' }" :aria-pressed="formatStates.header === 2 || formatStates.header === 'H2'" @click="format('header', 'H2')">标题</button>
      <button size="mini" :class="{ active: formatStates.list === 'bullet' }" :aria-pressed="formatStates.list === 'bullet'" @click="format('list', 'bullet')">列表</button><button size="mini" :loading="uploading" @click="insertImage">图片</button>
      <button size="mini" :class="{ active: moreTools }" :aria-expanded="moreTools" @click="moreTools = !moreTools">{{ moreTools ? '收起工具' : '更多' }}</button>
      <template v-if="moreTools">
        <button size="mini" :class="{ active: formatStates.italic === true }" :aria-pressed="formatStates.italic === true" @click="format('italic')">斜体</button><button size="mini" :class="{ active: formatStates.underline === true }" :aria-pressed="formatStates.underline === true" @click="format('underline')">下划线</button>
        <button size="mini" :class="{ active: formatStates.blockquote === true }" :aria-pressed="formatStates.blockquote === true" @click="format('blockquote')">引用</button><button size="mini" :class="{ active: !!formatStates.link }" :aria-pressed="!!formatStates.link" @click="setLink">链接</button>
        <button size="mini" @click="editorContext?.undo()">撤销</button><button size="mini" @click="editorContext?.redo()">重做</button>
      </template>
    </view>
    <editor id="product-rich-editor" class="editor" placeholder="介绍商品特点、规格与使用说明，可插入图片补充细节。" show-img-size show-img-resize show-img-toolbar @ready="onReady" @input="onInput" @statuschange="onStatusChange" />
    <text class="tip">图片上传后会插入正文，最多 30 张。</text>
  </view>
</template>

<style scoped>
.rich-editor { overflow: hidden; border: 1rpx solid #e5e6eb; border-radius: var(--yb-radius-md); background: #fff; }
.disabled { opacity: .65; pointer-events: none; }.toolbar { display: flex; flex-wrap: wrap; gap: 8rpx; padding: 12rpx; border-bottom: 1rpx solid #e5e6eb; background: #f7f8fa; }
.toolbar button { display: flex; align-items: center; justify-content: center; margin: 0; min-height: 88rpx; padding: 8rpx 16rpx; border: 1rpx solid var(--yb-border); border-radius: 12rpx; background: #fff; box-shadow: none; font-size: 24rpx; line-height: 1.4; } .toolbar button::after { border: none; }.editor { min-height: 320rpx; padding: 20rpx; font-size: 26rpx; line-height: 1.7; }
.tip { display: block; padding: 0 20rpx 14rpx; color: var(--yb-muted); font-size: 24rpx; }
.toolbar button.active { border-color:var(--yb-brand); background:var(--yb-brand-soft); color:var(--yb-brand); font-weight:600; }
</style>
