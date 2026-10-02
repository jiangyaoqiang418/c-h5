<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';
import { formatAmount } from '@/utils/format-bridge';
import type { WalletTxnView } from '@/service/api/wallet';

interface Props {
  visible: boolean;
  txn?: WalletTxnView;
}
const props = defineProps<Props>();
defineEmits<{ (e: 'update:visible', v: boolean): void }>();

const meta = computed(() => (props.txn ? enums.TXN_TYPE_META[props.txn.type] : undefined));
const sign = computed(() => (props.txn?.direction === 'transfer' ? '' : props.txn?.direction === 'in' ? '+' : '-'));

function copy(text?: string) {
  if (!text) return;
  uni.setClipboardData({ data: text, success: () => uni.showToast({ title: '已复制', icon: 'none' }) });
}
</script>

<template>
  <wd-popup
    :model-value="visible"
    position="bottom"
    :safe-area-inset-bottom="true"
    :close-on-click-modal="true"
    closable
    @update:model-value="(v: boolean) => $emit('update:visible', v)"
  >
    <view v-if="txn && meta" class="detail-popup">
      <view class="head">
        <text class="type-tag">{{ txn.typeText || meta.label }}</text>
        <text class="amount" :class="txn.direction">{{ sign }}{{ formatAmount(txn.amount) }} <text class="unit">USDT</text></text>
        <text class="balance">变动后余额 {{ formatAmount(txn.balanceAfter) }} USDT</text>
      </view>
      <scroll-view scroll-y class="rows">
        <view class="row"><text class="lbl">流水编号</text><text>#{{ txn.id }}</text></view>
        <view class="row"><text class="lbl">类型</text><text>{{ txn.typeText || meta.label }}</text></view>
        <view class="row"><text class="lbl">方向</text><text>{{ txn.direction === 'transfer' ? '账户间划转' : txn.direction === 'in' ? '收入' : '支出' }}</text></view>
        <view v-if="txn.bucketFrom" class="row"><text class="lbl">出账账户</text><text>{{ enums.BUCKET_META[txn.bucketFrom]?.label || '其他账户' }}</text></view>
        <view v-if="txn.bucketTo" class="row"><text class="lbl">入账账户</text><text>{{ enums.BUCKET_META[txn.bucketTo]?.label || '其他账户' }}</text></view>
        <view v-if="txn.refId" class="row"><text class="lbl">关联单号</text><text>{{ txn.refId }}</text></view>
        <view v-if="txn.remark" class="row"><text class="lbl">备注</text><text>{{ txn.remark }}</text></view>
        <view v-if="txn.chainTxHash" class="row" @click="copy(txn.chainTxHash)">
          <text class="lbl">交易哈希</text>
          <view class="copy-value"><text class="mono">{{ txn.chainTxHash }}</text><wd-icon name="copy" size="15px" color="#727782" /></view>
        </view>
        <view v-if="txn.fromAddress" class="row" @click="copy(txn.fromAddress)">
          <text class="lbl">来源地址</text>
          <view class="copy-value"><text class="mono">{{ txn.fromAddress }}</text><wd-icon name="copy" size="15px" color="#727782" /></view>
        </view>
        <view v-if="txn.toAddress" class="row" @click="copy(txn.toAddress)">
          <text class="lbl">目标地址</text>
          <view class="copy-value"><text class="mono">{{ txn.toAddress }}</text><wd-icon name="copy" size="15px" color="#727782" /></view>
        </view>
        <view class="row"><text class="lbl">时间</text><text>{{ new Date(txn.createdAt).toLocaleString() }}</text></view>
      </scroll-view>
    </view>
  </wd-popup>
</template>

<style lang="scss" scoped>
.detail-popup {
  display: flex;
  flex-direction: column;
  padding: 32rpx;
  box-sizing: border-box;
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  height: auto;
  max-height: 80vh;
  overflow: hidden;
}
.head {
  flex-shrink: 0;
  text-align: center;
  padding-bottom: 24rpx;
  border-bottom: 1rpx dashed #f2f3f5;
}
.unit { font-size: 24rpx; font-weight: 400; color: var(--yb-muted); }
.type-tag {
  background: #f3f7ff;
  color: var(--yb-brand);
  padding: 4rpx 16rpx;
  border-radius: 8rpx;
  font-size: 24rpx;
}
.amount {
  overflow-wrap: anywhere;
  display: block;
  font-size: 56rpx;
  font-weight: 700;
  font-family: var(--yb-font-body);
  margin: 16rpx 0 8rpx;
}
.amount.in { color: #00b42a; }
.amount.out { color: #f53f3f; }
.balance {
  overflow-wrap: anywhere;
  font-size: 24rpx;
  color: var(--yb-muted);
}
.rows {
  flex: 0 1 auto;
  min-height: 0;
  max-height:54vh;
  width: 100%;
  padding-top: 16rpx;
  box-sizing: border-box;
}
.row {
  gap: 20rpx;
  display: flex;
  justify-content: space-between;
  padding: 16rpx 0;
  font-size: 26rpx;
  color: #1d2129;
  border-bottom: 1rpx solid var(--yb-border);
}
.lbl {
  flex-shrink: 0;
  color: var(--yb-muted);
}
.mono {
  font-family: ui-monospace, monospace;
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: right;
}
.row > text:last-child { min-width:0; text-align:right; overflow-wrap:anywhere; }
.copy-value { display:flex; align-items:flex-start; gap:8rpx; min-width:0; flex:1; justify-content:flex-end; }.copy-value :deep(.wd-icon) { flex-shrink:0; }
</style>
