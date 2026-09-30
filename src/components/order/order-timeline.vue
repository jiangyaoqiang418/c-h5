<script setup lang="ts">
import { computed } from 'vue';
import { formatUsdt } from '@shared/utils/currency';
const props = defineProps<{ order: Api.RealOrder.OrderView; logistics?: Api.RealOrder.LogisticsDTO }>();
interface Event {
  key: string; title: string; description?: string; time?: string | number;
  location?: string; source?: string; major: boolean; exception?: boolean;
  shipping?: string; fees?: string; remark?: string; vouchers?: string[];
  registered?: string; tracking?: string; eta?: string; exceptionText?: string;
}
const labels: Record<Api.RealOrder.LogisticsStatus, string> = {
  PENDING_SHIPMENT: '待发货', SHIPPED: '已发货', IN_TRANSIT: '运输中', DELIVERING: '派送中', SIGNED: '已签收', EXCEPTION: '物流异常', RETURNED: '已退回'
};
function timestamp(value?: string | number | null) {
  if (value == null || value === '') return;
  const result = typeof value === 'number' || /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  if (Number.isFinite(result) && !Number.isNaN(new Date(result).getTime())) return result;
}
function formatTime(value?: string | number) {
  const time = timestamp(value); return time === undefined ? '' : new Date(time).toLocaleString();
}
const rows = computed(() => {
  const order = props.order;
  const logistics = props.logistics && String(props.logistics.orderId) === String(order.id) ? props.logistics : undefined;
  const tracks = [...(logistics?.tracks || [])].sort((a, b) => (timestamp(a.occurredAt) ?? -1) - (timestamp(b.occurredAt) ?? -1));
  const shipping = [logistics?.carrierName || logistics?.carrier, logistics?.trackingNo ? `运单号 ${logistics.trackingNo}` : ''].filter(Boolean).join(' · ');
  const fees = [logistics?.shippingFee != null ? `发货运费 ${formatUsdt(logistics.shippingFee)}` : '', logistics?.taxFee != null ? `发货税费 ${formatUsdt(logistics.taxFee)}` : ''].filter(Boolean).join(' · ');
  const shipment = { shipping, fees, remark: logistics?.shippedRemark, vouchers: logistics?.shipVouchers || [] };
  const events: Event[] = [{ key: 'created', title: '已下单', description: '订单已提交', time: order.createdAt, major: true }];
  if (order.paidAt) events.push({ key: 'paid', title: '已付款', description: '订单支付成功', time: order.paidAt, major: true });
  const shippedAt = order.shippedAt || logistics?.shippedAt;
  const shippedTrack = tracks.findIndex(track => track.status === 'SHIPPED');
  if (shippedAt && !tracks.some(track => track.status === 'SHIPPED' && timestamp(track.occurredAt) === timestamp(shippedAt))) {
    events.push({ key: 'shipped', title: '已发货', description: '买手已提交发货信息', time: shippedAt, major: true, ...(shippedTrack < 0 ? shipment : {}) });
  }
  const completedAt = order.completedAt || logistics?.completedAt;
  const confirmationTrack = order.rawStatus === 'COMPLETED' && completedAt
    ? tracks.find(track => track.status === 'SIGNED' && track.source === 'MANUAL' && /确认收货/.test(track.description || '') && timestamp(track.occurredAt) === timestamp(completedAt)) : undefined;
  if (order.rawStatus === 'COMPLETED' && !confirmationTrack) events.push({ key: 'completed', title: '订单完成', description: '交易已完成', time: completedAt, major: true });
  if (order.rawStatus === 'CANCELED') events.push({ key: 'canceled', title: '已取消', description: order.cancelReason, time: order.canceledAt, major: true });
  if (order.rawStatus === 'REFUNDED' || order.rawStatus === 'REFUND_REVIEW') events.push({ key: 'current', title: order.rawStatus === 'REFUNDED' ? '退款完成' : '售后处理中', major: true });
  tracks.forEach((track, index) => {
    const major = index === 0 || tracks[index - 1].status !== track.status || track === confirmationTrack;
    const source = track.sourceText || (track.source === 'CARRIER_SYNC' ? '承运商同步' : track.source === 'MANUAL' ? '人工登记' : '');
    const occurred = timestamp(track.occurredAt), registered = timestamp(track.createdAt);
    const exception = track.exceptionNode === true || track.status === 'EXCEPTION';
    events.push({
      key: `track-${String(track.trackId)}`, title: track === confirmationTrack ? '买家确认收货 · 订单完成' : major ? track.statusText || labels[track.status] || '物流更新' : track.description || track.statusText || '物流更新',
      description: major && track !== confirmationTrack && track.description !== track.statusText ? track.description : undefined,
      time: track.occurredAt, location: track.location, source, major, exception,
      exceptionText: exception ? logistics?.logisticsException : undefined,
      tracking: track.trackingNo && track.trackingNo !== logistics?.trackingNo ? `当时运单号 ${track.trackingNo}` : undefined,
      registered: occurred !== undefined && registered !== undefined && Math.abs(registered - occurred) >= 60_000 ? `${track.source === 'CARRIER_SYNC' ? '同步' : '登记'}于 ${formatTime(track.createdAt)}` : undefined,
      ...(index === shippedTrack || shippedTrack < 0 && !shippedAt && index === 0 ? shipment : {})
    });
  });
  if (logistics?.logisticsStatus && tracks[tracks.length - 1]?.status !== logistics.logisticsStatus
    && !(logistics.logisticsStatus === 'PENDING_SHIPMENT' && !['CREATED', 'PAID'].includes(order.rawStatus))
    && !(logistics.logisticsStatus === 'SHIPPED' && events.some(event => event.key === 'shipped'))) {
    events.push({ key: 'current-logistics', title: logistics.logisticsStatusText || labels[logistics.logisticsStatus], description: '当前物流状态', major: true, exception: logistics.logisticsStatus === 'EXCEPTION', exceptionText: logistics.logisticsException });
  }
  if (!shippedAt && !tracks.length && (shipping || fees || shipment.remark || shipment.vouchers.length)) events.push({ key: 'shipment', title: '发货资料', major: true, ...shipment });
  if (logistics?.logisticsException && !events.some(event => event.exceptionText)) events.push({ key: 'exception', title: '物流异常记录', major: true, exception: true, exceptionText: logistics.logisticsException });
  events.sort((a, b) => {
    const at = timestamp(a.time), bt = timestamp(b.time);
    if (at === undefined && bt === undefined) return 0;
    if (at === undefined) return a.key.startsWith('current') ? -1 : 1;
    if (bt === undefined) return b.key.startsWith('current') ? 1 : -1;
    return bt - at;
  });
  const eta = timestamp(logistics?.eta);
  if (eta !== undefined && eta > Date.now() && ['CREATED', 'PAID', 'SHIPPED'].includes(order.rawStatus) && logistics?.logisticsStatus !== 'SIGNED' && !logistics?.completedAt) {
    const event = events.find(item => item.key.startsWith('track-') || item.key === 'shipped' || item.key === 'current-logistics');
    if (event) event.eta = formatTime(logistics?.eta);
  }
  let previousDate = '';
  return events.map(event => {
    const time = timestamp(event.time), date = time === undefined ? undefined : new Date(time);
    const day = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '';
    const showDay = day && day !== previousDate;
    if (day) previousDate = day;
    return { ...event, day: showDay && date ? `${day}/周${'日一二三四五六'[date.getDay()]}` : '', clock: date ? [date.getHours(), date.getMinutes(), date.getSeconds()].map(value => String(value).padStart(2, '0')).join(':') : '时间待确认' };
  });
});
function preview(urls: string[], current: string) { uni.previewImage({ urls, current }); }
</script>

<template>
  <view class="timeline">
    <view v-for="(event, index) in rows" :key="event.key" class="event" :class="{ latest: index === 0, exceptional: event.exception }">
      <text v-if="event.day" class="date">{{ event.day }}</text>
      <view class="event-row">
        <text class="time">{{ event.clock }}</text>
        <view class="rail"><view class="node" :class="{ minor: !event.major }" /><view v-if="index < rows.length - 1" class="line" /></view>
        <view class="content">
          <text class="title" :class="{ major: event.major }">{{ event.title }}</text>
          <text v-if="event.description" class="description">{{ event.description }}</text>
          <text v-if="event.location || event.source" class="meta">{{ [event.location, event.source].filter(Boolean).join(' · ') }}</text>
          <text v-if="event.shipping" class="meta">{{ event.shipping }}</text>
          <text v-if="event.tracking || event.registered" class="meta">{{ [event.tracking, event.registered].filter(Boolean).join(' · ') }}</text>
          <text v-if="event.fees" class="meta">{{ event.fees }}</text>
          <text v-if="event.remark" class="description">发货备注：{{ event.remark }}</text>
          <text v-if="event.eta" class="meta">预计送达：{{ event.eta }}</text>
          <text v-if="event.exceptionText" class="exception-text">{{ event.exceptionText }}</text>
          <view v-if="event.vouchers?.length" class="vouchers"><image v-for="url in event.vouchers" :key="url" :src="url" mode="aspectFill" @click="preview(event.vouchers!, url)" /></view>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.timeline { padding: 8rpx 0; }.date { display: block; padding: 8rpx 0 20rpx; color: #86909c; font-size: 22rpx; }
.event-row { display: flex; align-items: stretch; }.time { flex: none; width: 132rpx; padding-top: 3rpx; font-size: 22rpx; color: #86909c; }
.rail { flex: none; width: 32rpx; display: flex; flex-direction: column; align-items: center; }
.node { flex: none; width: 24rpx; height: 24rpx; border-radius: 50%; background: #c9cdd4; margin-top: 5rpx; }
.node.minor { width: 12rpx; height: 12rpx; margin: 11rpx 0 6rpx; }.line { width: 2rpx; flex: 1; background: #e5e6eb; min-height: 30rpx; }
.latest .node { background: var(--yb-brand); }.exceptional .node { background: #f53f3f; }
.content { min-width: 0; flex: 1; padding: 0 0 32rpx 18rpx; }.title, .description, .meta, .exception-text { display: block; overflow-wrap: anywhere; line-height: 1.6; }
.title { font-size: 25rpx; color: #4e5969; }.title.major { font-size: 28rpx; color: #1d2129; font-weight: 600; }
.description { margin-top: 5rpx; font-size: 24rpx; color: #4e5969; }.meta { margin-top: 5rpx; font-size: 21rpx; color: #86909c; }
.exception-text { margin-top: 5rpx; font-size: 24rpx; color: #f53f3f; }.vouchers { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 12rpx; }.vouchers image { width: 112rpx; height: 112rpx; border-radius: 8rpx; }
</style>
