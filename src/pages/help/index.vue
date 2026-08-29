<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { cmsApi } from '@shared';
import EmptyState from '@/components/common/empty-state.vue';

const articles = ref<Api.Cms.HelpArticle[]>([]);
const agreements = ref<Api.Cms.Agreement[]>([]);
const keyword = ref('');
const expandedCategories = ref<string[]>([]);
const popupOpen = ref(false);
const detail = ref<Api.Cms.HelpArticle | Api.Cms.Agreement>();
const detailKind = ref<'help' | 'agreement'>('help');

const CATEGORIES: { key: Api.Cms.HelpCategory; label: string }[] = [
  { key: 'guide', label: '新手指南' },
  { key: 'order', label: '订单' },
  { key: 'wallet', label: '钱包' },
  { key: 'kyc', label: 'KYC' },
  { key: 'aftersale', label: '售后' },
  { key: 'other', label: '其他' }
];

onMounted(async () => {
  const r = await cmsApi.fetchHelpArticles({ size: 100 });
  articles.value = r.records;
  agreements.value = await cmsApi.fetchAllCurrentAgreements();
});

const filtered = computed(() => {
  if (!keyword.value.trim()) return articles.value;
  const kw = keyword.value.trim().toLowerCase();
  return articles.value.filter(a => a.title.toLowerCase().includes(kw) || a.body.toLowerCase().includes(kw));
});

const grouped = computed(() => CATEGORIES.map(c => ({
  ...c,
  items: filtered.value.filter(a => a.category === c.key)
})).filter(g => g.items.length > 0));

function openHelp(a: Api.Cms.HelpArticle) {
  detail.value = a;
  detailKind.value = 'help';
  popupOpen.value = true;
}

async function openAgreement(kind: Api.Cms.AgreementKind) {
  const r = await cmsApi.fetchAgreementCurrent(kind);
  if (r) {
    detail.value = r;
    detailKind.value = 'agreement';
    popupOpen.value = true;
  }
}

const AGREEMENT_LINKS: { kind: Api.Cms.AgreementKind; label: string }[] = [
  { kind: 'user', label: '用户协议' },
  { kind: 'privacy', label: '隐私政策' },
  { kind: 'service', label: '服务条款' },
  { kind: 'kyc', label: 'KYC 说明' },
  { kind: 'aml', label: '反洗钱政策' }
];
</script>

<template>
  <view class="help-page yb-page">
    <view class="search">
      <input v-model="keyword" placeholder="搜索帮助文章" class="search-input" />
    </view>

    <view v-if="grouped.length" class="categories">
      <wd-collapse v-model="expandedCategories">
        <wd-collapse-item v-for="g in grouped" :key="g.key" :title="`${g.label} (${g.items.length})`" :name="g.key">
          <view class="art-row" v-for="a in g.items" :key="a.id" @click="openHelp(a)">
            <text class="art-title">{{ a.title }}</text>
            <wd-icon name="arrow-right" size="28rpx" color="#a2a7b4" />
          </view>
        </wd-collapse-item>
      </wd-collapse>
    </view>
    <EmptyState v-else title="未找到相关帮助" />

    <view class="agreements">
      <text class="ag-title">协议与政策</text>
      <view v-for="a in AGREEMENT_LINKS" :key="a.kind" class="ag-row" @click="openAgreement(a.kind)">
        <text>{{ a.label }}</text>
        <wd-icon name="arrow-right" size="28rpx" color="#a2a7b4" />
      </view>
    </view>

    <wd-popup v-model="popupOpen" position="bottom" :safe-area-inset-bottom="true">
      <view v-if="detail" class="popup">
        <text class="popup-title">{{ detail.title }}</text>
        <text v-if="detailKind === 'agreement'" class="popup-meta">版本 {{ (detail as Api.Cms.Agreement).version }} · 生效 {{ new Date((detail as Api.Cms.Agreement).effectiveAt).toLocaleDateString() }}</text>
        <text class="popup-content">{{ detail.body }}</text>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
.help-page { min-height: 100%; padding: 20rpx 24rpx 32rpx; }
.search { padding: 0; background: transparent; }
.search-input {
  height: 72rpx;
  background: #fff;
  border: 1rpx solid var(--yb-border);
  border-radius: var(--yb-radius-md);
  padding: 0 24rpx;
  font-size: 26rpx;
}
.categories { overflow: hidden; background: #fff; margin-top: 20rpx; border: 1rpx solid var(--yb-border); border-radius: var(--yb-radius-lg); box-shadow: var(--yb-shadow-card); }
.art-row { display: flex; align-items: center; justify-content: space-between; padding: 24rpx; border-bottom: 1rpx solid var(--yb-border); }
.art-title { font-size: 26rpx; color: #1d2129; }
.agreements { background: #fff; margin-top: 20rpx; padding: 24rpx; border: 1rpx solid var(--yb-border); border-radius: var(--yb-radius-lg); box-shadow: var(--yb-shadow-card); }
.ag-title { display: block; font-size: 26rpx; font-weight: 600; margin-bottom: 16rpx; color: #4e5969; }
.ag-row { display: flex; align-items:center; justify-content: space-between; padding: 20rpx 0; border-bottom: 1rpx solid var(--yb-border); font-size: 26rpx; }
.popup { padding: 32rpx 28rpx calc(32rpx + env(safe-area-inset-bottom)); max-height: 80vh; overflow-y: auto; border-radius: 32rpx 32rpx 0 0; }
.popup-title { display: block; font-size: 32rpx; font-weight: 700; }
.popup-meta { display: block; font-size: 22rpx; color: #86909c; margin: 8rpx 0 24rpx; }
.popup-content { font-size: 26rpx; color: #4e5969; line-height: 1.7; white-space: pre-wrap; }
</style>
