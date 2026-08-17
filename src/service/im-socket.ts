import { realServiceConfig } from './config';
import { getAccessToken } from './request';
import { fetchImLinkStatus } from './api/notify';

type Listener = (message: unknown) => void;

function websocketUrl(gatewayPath: string): string {
  const base = realServiceConfig.notify || '/api/notify';
  if (/^https?:\/\//.test(base)) {
    const parsed = new URL(base);
    const prefix = parsed.pathname.endsWith('/notify') ? parsed.pathname.slice(0, -'/notify'.length) : '';
    return `${parsed.protocol === 'https:' ? 'wss:' : 'ws:'}//${parsed.host}${prefix}${gatewayPath}`;
  }
  // #ifdef H5
  const prefix = base.endsWith('/notify') ? base.slice(0, -'/notify'.length) : '';
  return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${prefix}${gatewayPath}`;
  // #endif
  return '';
}

/** Notify 服务约定：只有收到 READY 后才表示 WebSocket 已可用。 */
class ImSocket {
  private task?: UniApp.SocketTask;
  private heartbeat?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private retries = 0;
  private manuallyStopped = true;
  private ready = false;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  get connected() { return this.ready; }

  async start() {
    if (!this.manuallyStopped && this.task) return;
    this.manuallyStopped = false;
    const status = await fetchImLinkStatus();
    await this.connect(websocketUrl(status.gatewayPath), Math.min(25_000, Number(status.heartbeatIntervalMs) || 25_000));
  }

  stop() {
    this.manuallyStopped = true;
    this.ready = false;
    this.clearTimers();
    this.task?.close({ code: 1000, reason: 'page-unload' });
    this.task = undefined;
  }

  private async connect(url: string, heartbeatMs: number) {
    if (!url || this.manuallyStopped) return;
    this.clearTimers();
    this.ready = false;
    const token = getAccessToken();
    const task = await uni.connectSocket({ url, header: token ? { 'X-Access-Token': token } : {} }) as UniApp.SocketTask;
    this.task = task;
    task.onOpen(() => undefined);
    task.onMessage((event: UniApp.OnSocketMessageCallbackResult) => {
      const raw = typeof event.data === 'string' ? event.data : '';
      let message: unknown = raw;
      try { message = JSON.parse(raw); } catch { /* READY/PONG can be plain text */ }
      const type = typeof message === 'object' && message ? String((message as { type?: unknown }).type || '') : raw;
      if (type === 'READY') {
        this.ready = true;
        this.retries = 0;
        this.heartbeat = setInterval(() => task.send({ data: 'PING' }), Math.max(5_000, heartbeatMs));
        return;
      }
      if (type === '401' || (typeof message === 'object' && message && Number((message as { code?: unknown }).code) === 401)) {
        this.stop();
        uni.showToast({ title: '登录已失效，请重新登录', icon: 'none' });
        return;
      }
      this.listeners.forEach(listener => listener(message));
    });
    task.onClose(() => this.reconnect(url, heartbeatMs));
    task.onError(() => this.reconnect(url, heartbeatMs));
  }

  private reconnect(url: string, heartbeatMs: number) {
    this.ready = false;
    if (this.manuallyStopped || this.reconnectTimer) return;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.retries++, 5));
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; this.connect(url, heartbeatMs).catch(() => this.reconnect(url, heartbeatMs)); }, delay);
  }

  private clearTimers() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.heartbeat = undefined;
    this.reconnectTimer = undefined;
  }
}

export const imSocket = new ImSocket();
