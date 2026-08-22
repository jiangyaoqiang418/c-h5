import { realServiceConfig } from './config';
import { getAccessToken } from './request';
import { fetchImLinkStatus } from './api/notify';

type Listener = (message: unknown) => void;
export type ImSocketState = 'idle' | 'connecting' | 'ready' | 'unavailable';
type StateListener = (state: ImSocketState) => void;

function websocketUrl(gatewayPath: string, token: string): string {
  const base = realServiceConfig.notify || '/api/notify';
  let url = '';
  if (/^https?:\/\//.test(base)) {
    const parsed = new URL(base);
    const prefix = parsed.pathname.endsWith('/notify') ? parsed.pathname.slice(0, -'/notify'.length) : '';
    url = `${parsed.protocol === 'https:' ? 'wss:' : 'ws:'}//${parsed.host}${prefix}${gatewayPath}`;
  }
  // #ifdef H5
  if (!url) {
    const prefix = base.endsWith('/notify') ? base.slice(0, -'/notify'.length) : '';
    url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${prefix}${gatewayPath}`;
  }
  // #endif
  return url ? `${url}?token=${encodeURIComponent(token)}` : '';
}

/** Notify 服务约定：只有收到 READY 后才表示 WebSocket 已可用。 */
class ImSocket {
  private task?: UniApp.SocketTask;
  private heartbeat?: ReturnType<typeof setInterval>;
  private readyTimer?: ReturnType<typeof setTimeout>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private retries = 0;
  private manuallyStopped = true;
  private ready = false;
  private state: ImSocketState = 'idle';
  private listeners = new Set<Listener>();
  private stateListeners = new Set<StateListener>();

  subscribe(listener: Listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  subscribeState(listener: StateListener) {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }
  get connected() { return this.ready; }

  async start() {
    if (!this.manuallyStopped && this.task) return;
    this.manuallyStopped = false;
    this.updateState('connecting');
    try {
      const status = await fetchImLinkStatus();
      const token = getAccessToken();
      if (!token) {
        this.updateState('idle');
        return;
      }
      await this.connect(websocketUrl(status.gatewayPath, token), Math.min(25_000, Number(status.heartbeatIntervalMs) || 25_000));
    } catch (error) {
      this.updateState('unavailable');
      throw error;
    }
  }

  async restart() {
    this.stop();
    await this.start();
  }

  stop() {
    this.manuallyStopped = true;
    this.ready = false;
    this.clearTimers();
    this.closeTask(this.task, 1000, 'page-unload');
    this.task = undefined;
    this.updateState('idle');
  }

  private async connect(url: string, heartbeatMs: number) {
    if (!url || this.manuallyStopped) {
      this.updateState('unavailable');
      return;
    }
    this.clearTimers();
    this.ready = false;
    const token = getAccessToken();
    const task = await uni.connectSocket({ url, header: token ? { 'X-Access-Token': token } : {} }) as UniApp.SocketTask;
    this.task = task;
    task.onOpen(() => {
      if (this.task !== task) return;
      this.readyTimer = setTimeout(() => {
        if (!this.ready) this.closeTask(task, 4001, 'ready-timeout');
      }, 10_000);
    });
    task.onMessage((event: UniApp.OnSocketMessageCallbackResult) => {
      if (this.task !== task) return;
      const raw = typeof event.data === 'string' ? event.data : '';
      let message: unknown = raw;
      try { message = JSON.parse(raw); } catch { /* READY/PONG can be plain text */ }
      const type = typeof message === 'object' && message ? String((message as { type?: unknown }).type || '') : raw;
      if (type === 'READY') {
        if (this.readyTimer) clearTimeout(this.readyTimer);
        this.readyTimer = undefined;
        this.ready = true;
        this.updateState('ready');
        this.retries = 0;
        this.heartbeat = setInterval(() => task.send({ data: JSON.stringify({ type: 'PING' }) }), Math.max(5_000, heartbeatMs));
        return;
      }
      if (type === 'PONG') return;
      if (type === '401' || (typeof message === 'object' && message && Number((message as { code?: unknown }).code) === 401)) {
        this.stop();
        uni.showToast({ title: '登录已失效，请重新登录', icon: 'none' });
        return;
      }
      this.listeners.forEach(listener => listener(message));
    });
    task.onClose(() => {
      if (this.task !== task) return;
      this.task = undefined;
      this.reconnect(url, heartbeatMs);
    });
    task.onError(() => {
      if (this.task !== task) return;
      this.task = undefined;
      this.reconnect(url, heartbeatMs);
    });
  }

  private reconnect(url: string, heartbeatMs: number) {
    this.ready = false;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.heartbeat = undefined;
    this.readyTimer = undefined;
    this.updateState('unavailable');
    if (this.manuallyStopped || this.reconnectTimer) return;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.retries++, 5));
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; this.connect(url, heartbeatMs).catch(() => this.reconnect(url, heartbeatMs)); }, delay);
  }

  private clearTimers() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.readyTimer) clearTimeout(this.readyTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.heartbeat = undefined;
    this.readyTimer = undefined;
    this.reconnectTimer = undefined;
  }

  /** H5 网关异常时可能返回非 SocketTask 句柄，清理阶段不能再次抛出错误。 */
  private closeTask(task: UniApp.SocketTask | undefined, code: number, reason: string) {
    const close = (task as { close?: unknown } | undefined)?.close;
    if (typeof close === 'function') {
      close.call(task, { code, reason });
    }
  }

  private updateState(state: ImSocketState) {
    if (this.state === state) return;
    this.state = state;
    this.stateListeners.forEach(listener => listener(state));
  }
}

export const imSocket = new ImSocket();
