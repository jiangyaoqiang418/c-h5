<script setup lang="ts">
import { computed, ref, watch } from 'vue';
const props = defineProps<{ order: Api.RealOrder.OrderView; logistics?: Api.RealOrder.LogisticsDTO }>();
const expanded = ref(false);
watch(() => props.order.id, () => { expanded.value = false; });
interface Event {
  key: string; title: string; description?: string; time?: string | number;
  trackId?: string | number;
  statusLabel?: string;
  location?: string; source?: string; major: boolean; exception?: boolean;
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
  const events: Event[] = [{ key: 'created', title: '已下单', description: '订单已提交', time: order.createdAt, major: true }];
  if (order.paidAt) events.push({ key: 'paid', title: '已付款', description: '订单支付成功', time: order.paidAt, major: true });
  const shippedAt = order.shippedAt || logistics?.shippedAt;
  if (shippedAt && !tracks.some(track => track.status === 'SHIPPED' && timestamp(track.occurredAt) === timestamp(shippedAt))) {
    events.push({ key: 'shipped', title: '已发货', description: '买手已提交发货信息', time: shippedAt, major: true });
  }
  const completedAt = order.completedAt || logistics?.completedAt;
  const confirmationTrack = order.rawStatus === 'COMPLETED' && completedAt
    ? tracks.find(track => track.status === 'SIGNED' && track.source === 'MANUAL' && /确认收货/.test(track.description || '') && timestamp(track.occurredAt) === timestamp(completedAt)) : undefined;
  if (order.rawStatus === 'COMPLETED' && !confirmationTrack) events.push({ key: 'completed', title: '订单完成', description: '交易已完成', time: completedAt, major: true });
  if (order.rawStatus === 'CANCELED') events.push({ key: 'canceled', title: '已取消', description: order.cancelReason, time: order.canceledAt, major: true });
  if (order.rawStatus === 'REFUNDED' || order.rawStatus === 'REFUND_REVIEW') events.push({ key: 'current', title: order.rawStatus === 'REFUNDED' ? '退款完成' : '售后处理中', major: true });
  tracks.forEach((track, index) => {
    const major = index === 0 || tracks[index - 1].status !== track.status || track === confirmationTrack;
    const source = track.sourceText || (track.source === 'CARRIER_SYNC' ? '承运商同步' : track.source === 'MANUAL' ? '人工登记' : track.source || '');
    const registered = timestamp(track.createdAt);
    const exception = track.exceptionNode === true || track.status === 'EXCEPTION';
    events.push({
      key: `track-${String(track.trackId)}`, title: track === confirmationTrack ? '买家确认收货 · 订单完成' : major ? track.statusText || labels[track.status] || '物流更新' : track.description || track.statusText || '物流更新',
      trackId: track.trackId,
      statusLabel: track.statusText || labels[track.status] || track.status,
      description: track.description !== track.statusText && (major || track === confirmationTrack) ? track.description : undefined,
      time: track.occurredAt, location: track.location, source, major, exception,
      exceptionText: exception ? logistics?.logisticsException : undefined,
      tracking: track.trackingNo && track.trackingNo !== logistics?.trackingNo ? `当时运单号 ${track.trackingNo}` : undefined,
      registered: registered !== undefined ? `${track.source === 'CARRIER_SYNC' ? '同步' : '登记'}于 ${formatTime(track.createdAt)}` : undefined
    });
  });
  if (logistics?.logisticsStatus && tracks[tracks.length - 1]?.status !== logistics.logisticsStatus
    && !(logistics.logisticsStatus === 'PENDING_SHIPMENT' && !['CREATED', 'PAID'].includes(order.rawStatus))
    && !(logistics.logisticsStatus === 'SHIPPED' && events.some(event => event.key === 'shipped'))) {
    events.push({ key: 'current-logistics', title: logistics.logisticsStatusText || labels[logistics.logisticsStatus], description: '当前物流状态', major: true, exception: logistics.logisticsStatus === 'EXCEPTION', exceptionText: logistics.logisticsException });
  }
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
const visibleRows = computed(() => expanded.value ? rows.value : rows.value.slice(0, 4));
const hiddenException = computed(() => !expanded.value && rows.value.slice(4).some(event => event.exception));
</script>

<template>
  <view class="timeline">
    <view v-for="(event, index) in visibleRows" :key="event.key" class="event" :class="{ latest: index === 0, exceptional: event.exception }">
      <text v-if="event.day" class="date">{{ event.day }}</text>
      <view class="event-row">
        <text class="time">{{ event.clock }}</text>
        <view class="rail"><view class="node" :class="{ minor: !event.major }" /><view v-if="index < visibleRows.length - 1" class="line" /></view>
        <view class="content">
          <text class="title" :class="{ major: event.major }">{{ event.title }}</text>
          <text v-if="event.exception" class="exception-label">异常节点</text>
          <text v-if="event.description" class="description">{{ event.description }}</text>
          <text v-if="event.location || event.source" class="meta">{{ [event.location, event.source].filter(Boolean).join(' · ') }}</text>
          <text v-if="event.tracking || event.registered" class="meta">{{ [event.tracking, event.registered].filter(Boolean).join(' · ') }}</text>
          <text v-if="expanded && event.trackId != null" class="meta">轨迹编号 {{ event.trackId }}</text>
          <text v-if="expanded && event.statusLabel && event.statusLabel !== event.title" class="meta">节点状态 {{ event.statusLabel }}</text>
          <text v-if="event.eta" class="meta">预计送达：{{ event.eta }}</text>
          <text v-if="event.exceptionText" class="exception-text">{{ event.exceptionText }}</text>
        </view>
      </view>
    </view>
    <text v-if="hiddenException" class="history-warning">历史进度含物流异常节点，可展开查看完整记录。</text>
    <view class="timeline-tools"><wd-button v-if="rows.length > 4 || rows.some(event => event.trackId != null)" plain size="small" @click="expanded = !expanded">{{ expanded ? '收起进度详情' : rows.length > 4 ? `查看全部 ${rows.length} 条进度` : '查看进度详情' }}</wd-button></view>
  </view>
</template>

<style scoped>
.timeline { padding: 8rpx 0; }.date { display: block; padding: 8rpx 0 20rpx; color: var(--yb-muted); font-size: 24rpx; }
.event-row { display: flex; align-items: stretch; }.time { flex: none; width: 124rpx; padding-top: 3rpx; font-size: 24rpx; color: var(--yb-muted); }
.rail { flex: none; width: 32rpx; display: flex; flex-direction: column; align-items: center; }
.node { flex: none; width: 24rpx; height: 24rpx; border-radius: 50%; background: #c9cdd4; margin-top: 5rpx; }
.node.minor { width: 12rpx; height: 12rpx; margin: 11rpx 0 6rpx; }.line { width: 2rpx; flex: 1; background: #e5e6eb; min-height: 30rpx; }
.latest .node { background: var(--yb-brand); }.exceptional .node { background: #f53f3f; }
.content { min-width: 0; flex: 1; padding: 0 0 24rpx 18rpx; }.title, .description, .meta, .exception-text { display: block; overflow-wrap: anywhere; line-height: 1.6; }
.timeline-tools { display:flex; justify-content:flex-end; }
.title { font-size: 25rpx; color: #4e5969; }.title.major { font-size: 28rpx; color: #1d2129; font-weight: 600; }
.description { margin-top: 5rpx; font-size: 24rpx; color: #4e5969; }.meta { margin-top: 5rpx; font-size: 24rpx; color: var(--yb-muted); }
.exception-text { margin-top: 5rpx; font-size: 24rpx; color: #b42318; }.history-warning { display: block; margin-bottom: 16rpx; color: #8b5300; font-size: 24rpx; line-height: 1.6; }
.exception-label { display: inline-flex; margin-top: 6rpx; padding: 2rpx 12rpx; border-radius: 8rpx; background: #fff2f0; color: #b42318; font-size: 24rpx; line-height: 1.6; }
</style>
