<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { Editor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { TableKit } from '@tiptap/extension-table';
import { uploadProductImage } from '@/service/api/product';
import { sanitizeRichText } from '@/utils/rich-text';

const props = withDefaults(defineProps<{ modelValue: string; disabled?: boolean }>(), { disabled: false });
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void; (e: 'uploading', value: boolean): void }>();
const uploading = ref(false);
const editor = new Editor({
  content: sanitizeRichText(props.modelValue), editable: !props.disabled,
  extensions: [StarterKit.configure({ link: false, underline: false }), Underline, Image.configure({ inline: false, allowBase64: false }), Link.configure({ openOnClick: false }), TableKit],
  onUpdate: ({ editor: current }) => emit('update:modelValue', sanitizeRichText(current.getHTML()))
});
watch(() => props.disabled, value => editor.setEditable(!value));
watch(() => props.modelValue, value => { const next = sanitizeRichText(value); if (next !== editor.getHTML()) editor.commands.setContent(next, { emitUpdate: false }); });
onBeforeUnmount(() => editor.destroy());

function setLink() {
  const href = window.prompt('请输入链接地址（http、https 或 mailto）', editor.getAttributes('link').href || '')?.trim();
  if (href === undefined) return;
  if (!href) return void editor.chain().focus().unsetLink().run();
  if (!/^(https?:\/\/|mailto:)/i.test(href)) return uni.showToast({ title: '链接格式不正确', icon: 'none' });
  editor.chain().focus().extendMarkRange('link').setLink({ href, target: '_blank', rel: 'noopener noreferrer' }).run();
}
async function uploadImage() {
  if (uploading.value) return;
  if ((props.modelValue.match(/<img\b/gi) || []).length >= 30) return uni.showToast({ title: '详情最多插入 30 张图片', icon: 'none' });
  try {
    const selected = await uni.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
    const path = Array.isArray(selected.tempFilePaths) ? selected.tempFilePaths[0] : selected.tempFilePaths;
    if (!path) return;
    uploading.value = true; emit('uploading', true);
    const uploaded = await uploadProductImage(path);
    editor.chain().focus().setImage({ src: uploaded.url || uploaded.filePath, alt: '商品详情图片' }).run();
  } catch (error) { uni.showToast({ title: error instanceof Error ? error.message : '详情图片上传失败', icon: 'none' }); }
  finally { uploading.value = false; emit('uploading', false); }
}
</script>

<template>
  <view class="rich-editor" :class="{ disabled }"><view class="toolbar">
    <button type="button" @click="editor.chain().focus().toggleBold().run()">加粗</button><button type="button" @click="editor.chain().focus().toggleItalic().run()">斜体</button>
    <button type="button" @click="editor.chain().focus().toggleUnderline().run()">下划线</button><button type="button" @click="editor.chain().focus().toggleHeading({ level: 2 }).run()">标题</button>
    <button type="button" @click="editor.chain().focus().toggleBulletList().run()">列表</button><button type="button" @click="editor.chain().focus().toggleBlockquote().run()">引用</button>
    <button type="button" @click="setLink">链接</button><button type="button" @click="editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()">表格</button>
    <button v-if="editor.isActive('table')" type="button" @click="editor.chain().focus().addRowAfter().run()">加行</button><button v-if="editor.isActive('table')" type="button" @click="editor.chain().focus().addColumnAfter().run()">加列</button>
    <button type="button" :disabled="uploading" @click="uploadImage">{{ uploading ? '上传中' : '图片' }}</button><button type="button" @click="editor.chain().focus().undo().run()">撤销</button><button type="button" @click="editor.chain().focus().redo().run()">重做</button>
  </view><EditorContent :editor="editor" class="editor-content" /><text class="tip">支持图文、链接和表格，图片会先上传后插入。</text></view>
</template>

<style scoped>
.rich-editor { overflow: hidden; border: 1rpx solid #e5e6eb; border-radius: var(--yb-radius-md); background: #fff; }.disabled { opacity: .65; pointer-events: none; }
.toolbar { display:flex; flex-wrap:wrap; gap:8rpx; padding:12rpx; border-bottom:1rpx solid #e5e6eb; background:#f7f8fa; }.toolbar button { margin:0; padding:6rpx 14rpx; border:1rpx solid #c9cdd4; border-radius:6rpx; background:#fff; font-size:22rpx; }
.editor-content :deep(.tiptap) { min-height:320rpx; padding:20rpx; outline:none; font-size:26rpx; line-height:1.7; }.editor-content :deep(img) { max-width:100%; height:auto; }.editor-content :deep(table) { width:100%; border-collapse:collapse; }.editor-content :deep(th), .editor-content :deep(td) { min-width:100rpx; padding:10rpx; border:1rpx solid #c9cdd4; }
.tip { display:block; padding:0 20rpx 14rpx; color:#86909c; font-size:21rpx; }
</style>
