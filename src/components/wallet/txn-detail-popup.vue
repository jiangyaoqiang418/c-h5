<script setup lang="ts">
import { computed } from 'vue';
import { enums } from '@shared';
import { formatAmount, shortAddress } from '@/utils/format-bridge';

interface Props {
  visible: boolean;
  txn?: Api.Wallet.Txn;
}
const props = defineProps<Props>();
defineEmits<{ (e: 'update:visible', v: boolean): void }>();

const meta = computed(() => (props.txn ? enums.TXN_TYPE_META[props.txn.type] : undefined));
const sign = computed(() => (props.txn?.direction === 'in' ? '+' : '-'));

function copy(text?: string) {
  if (!text) return;
  uni.setClipboardData({ data: text, success: () => uni.showToast({ title: '已复制', icon: 'none' }) });
}
</script>

<template>
  <wd-popup
    :model-value="visible"
    position="bottom"
    :close-on-click-modal="true"
    closable
    @update:model-value="(v: boolean) => $emit('update:visible', v)"
  >
    <view v-if="txn && meta" class="detail-popup">
      <view class="head">
        <text class="type-tag">{{ meta.label }}</text>
        <text class="amount" :class="txn.direction">{{ sign }}{{ formatAmount(txn.amount) }} U</text>
        <text class="balance">余额 U {{ formatAmount(txn.balanceAfter) }}</text>
      </view>
      <view class="rows">
        <view class="row"><text class="lbl">流水编号</text><text>#{{ txn.id }}</text></view>
        <view class="row"><text class="lbl">类型</text><text>{{ txn.type }}</text></view>
        <view class="row"><text class="lbl">方向</text><text>{{ txn.direction === 'in' ? '收入' : '支出' }}</text></view>
        <view v-if="txn.bucketFrom" class="row"><text class="lbl">出账桶</text><text>{{ txn.bucketFrom }}</text></view>
        <view v-if="txn.bucketTo" class="row"><text class="lbl">入账桶</text><text>{{ txn.bucketTo }}</text></view>
        <view v-if="txn.refType || txn.refId" class="row"><text class="lbl">关联引用</text><text>{{ txn.refType || '' }} · {{ txn.refId || '' }}</text></view>
        <view v-if="txn.remark" class="row"><text class="lbl">备注</text><text>{{ txn.remark }}</text></view>
        <view v-if="txn.chainTxHash" class="row" @click="copy(txn.chainTxHash)">
          <text class="lbl">交易哈希</text>
          <text class="mono">{{ shortAddress(txn.chainTxHash, 10, 8) }} 📋</text>
        </view>
        <view v-if="txn.fromAddress" class="row" @click="copy(txn.fromAddress)">
          <text class="lbl">来源地址</text>
          <text class="mono">{{ shortAddress(txn.fromAddress) }} 📋</text>
        </view>
        <view v-if="txn.toAddress" class="row" @click="copy(txn.toAddress)">
          <text class="lbl">目标地址</text>
          <text class="mono">{{ shortAddress(txn.toAddress) }} 📋</text>
        </view>
        <view class="row"><text class="lbl">时间</text><text>{{ new Date(txn.createdAt).toLocaleString() }}</text></view>
      </view>
    </view>
  </wd-popup>
</template>

<style lang="scss" scoped>
.detail-popup {
  padding: 32rpx;
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  max-height: 80vh;
  overflow-y: auto;
}
.head {
  text-align: center;
  padding-bottom: 24rpx;
  border-bottom: 1rpx dashed #f2f3f5;
}
.type-tag {
  background: #f3f7ff;
  color: #4d80f0;
  padding: 4rpx 16rpx;
  border-radius: 8rpx;
  font-size: 22rpx;
}
.amount {
  display: block;
  font-size: 56rpx;
  font-weight: 700;
  font-family: ui-monospace, monospace;
  margin: 16rpx 0 8rpx;
}
.amount.in { color: #00b42a; }
.amount.out { color: #f53f3f; }
.balance {
  font-size: 22rpx;
  color: #86909c;
}
.rows {
  padding-top: 16rpx;
}
.row {
  display: flex;
  justify-content: space-between;
  padding: 16rpx 0;
  font-size: 26rpx;
  color: #1d2129;
  border-bottom: 1rpx solid #f7f8fa;
}
.lbl {
  color: #86909c;
}
.mono {
  font-family: ui-monospace, monospace;
}
</style>
