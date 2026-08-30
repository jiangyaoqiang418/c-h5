import { realServiceConfig } from './config';
import { getAccessToken, notifyLoginExpired } from './request';
import { onSessionChanged } from './request/token';
import { fetchImLinkStatus } from './api/notify';

type Listener = (message: unknown) => void;
export type ImSocketState = 'idle' | 'connecting' | 'ready' | 'unavailable';
type StateListener = (state: ImSocketState) => void;

interface SocketConnectionOptions {
  url: string;
  protocols?: string[];
}

function websocketOptions(status: Api.RealNotify.ImLinkStatusVO, token: string): SocketConnectionOptions {
  const base = realServiceConfig.notify || '/api/notify';
  let url = '';
  const useApiPrefix = base.startsWith('/api/') || /^https?:\/\//.test(base) && new URL(base).pathname.startsWith('/api/');
  const path = useApiPrefix && status.apiPrefixPath ? status.apiPrefixPath : status.gatewayPath;
  if (/^https?:\/\//.test(base)) {
    const parsed = new URL(base);
    url = `${parsed.protocol === 'https:' ? 'wss:' : 'ws:'}//${parsed.host}${path}`;
  }
  // #ifdef H5
  if (!url) {
    url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${path}`;
  }
  // #endif
  const tokenSources = status.tokenSources || ['QUERY_TOKEN'];
  if (tokenSources.includes('QUERY_TOKEN')) {
    return { url: url ? `${url}?token=${encodeURIComponent(token)}` : '' };
  }
  if (tokenSources.includes('SUB_PROTOCOL')) {
    const protocol = status.subProtocol || 'im';
    return { url, protocols: [protocol, `${protocol}.token.${token}`] };
  }
  return { url };
}

function socketMessageText(data: unknown): string {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  return '';
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
  private startTask?: Promise<void>;
  private generation = 0;

  subscribe(listener: Listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  subscribeState(listener: StateListener) {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }
  get connected() { return this.ready; }

  async start() {
    if (!this.manuallyStopped && (this.task || this.reconnectTimer)) return;
    if (this.startTask) return this.startTask;
    const task = this.startConnection(this.generation);
    this.startTask = task;
    try { await task; } finally { if (this.startTask === task) this.startTask = undefined; }
  }

  private async startConnection(generation: number) {
    const token = getAccessToken();
    if (!token) return;
    this.manuallyStopped = false;
    this.updateState('connecting');
    try {
      const status = await fetchImLinkStatus();
      if (generation !== this.generation || token !== getAccessToken() || this.manuallyStopped) return;
      const connection = websocketOptions(status, token);
      await this.connect(
        connection.url,
        Math.min(25_000, Number(status.heartbeatIntervalMs) || 25_000),
        connection.protocols
      );
    } catch (error) {
      if (generation !== this.generation || token !== getAccessToken() || this.manuallyStopped) return;
      this.updateState('unavailable');
      throw error;
    }
  }

  async restart() {
    this.stop();
    await this.start();
  }

  stop() {
    this.generation++;
    this.startTask = undefined;
    this.manuallyStopped = true;
    this.ready = false;
    this.clearTimers();
    const task = this.task;
    this.task = undefined;
    this.closeTask(task, 1000, 'page-unload');
    this.updateState('idle');
  }

  /** 多个消息页面共用连接，只有最后一个订阅者退出时才释放；退出账号仍强制 stop。 */
  stopIfUnused() {
    if (!this.listeners.size && !this.stateListeners.size) this.stop();
  }

  private async connect(url: string, heartbeatMs: number, protocols?: string[]) {
    if (!url || this.manuallyStopped) {
      this.updateState('unavailable');
      return;
    }
    this.clearTimers();
    this.ready = false;
    const token = getAccessToken();
    // H5 未传回调时会被 UniApp 包装成 Promise，Promise 成功值不是 SocketTask。
    // 显式回调可保留跨端 SocketTask，用于在握手后注册事件。
    const task = uni.connectSocket({
      url,
      header: token ? { 'X-Access-Token': token } : {},
      protocols,
      success: () => undefined,
      fail: () => undefined
    }) as unknown as UniApp.SocketTask;
    this.task = task;
    task.onOpen(() => {
      if (this.task !== task) return;
      this.readyTimer = setTimeout(() => {
        if (!this.ready) this.closeTask(task, 4001, 'ready-timeout');
      }, 10_000);
    });
    task.onMessage((event: UniApp.OnSocketMessageCallbackResult) => {
      if (this.task !== task) return;
      const raw = socketMessageText(event.data);
      let message: unknown = raw;
      try { message = JSON.parse(raw); } catch { /* READY/PONG can be plain text */ }
      const type = typeof message === 'object' && message ? String((message as { type?: unknown }).type || '') : raw;
      if (type === 'READY') {
        if (this.ready) return;
        if (this.readyTimer) clearTimeout(this.readyTimer);
        this.readyTimer = undefined;
        this.ready = true;
        this.updateState('ready');
        this.retries = 0;
        this.heartbeat = setInterval(() => task.send({ data: JSON.stringify({ type: 'PING' }) }), Math.max(1, heartbeatMs));
        return;
      }
      if (type === 'PONG') return;
      if (type === '401' || (typeof message === 'object' && message && Number((message as { code?: unknown }).code) === 401)) {
        this.stop();
        notifyLoginExpired(token);
        return;
      }
      this.listeners.forEach(listener => listener(message));
    });
    task.onClose(() => {
      if (this.task !== task) return;
      this.task = undefined;
      this.reconnect(url, heartbeatMs, protocols);
    });
    task.onError(() => {
      if (this.task !== task) return;
      this.task = undefined;
      this.closeTask(task, 4001, 'socket-error');
      this.reconnect(url, heartbeatMs, protocols);
    });
  }

  private reconnect(url: string, heartbeatMs: number, protocols?: string[]) {
    this.ready = false;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.heartbeat = undefined;
    this.readyTimer = undefined;
    this.updateState('unavailable');
    if (this.manuallyStopped || this.reconnectTimer) return;
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(this.retries++, 5));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect(url, heartbeatMs, protocols).catch(() => this.reconnect(url, heartbeatMs, protocols));
    }, delay);
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
onSessionChanged(() => imSocket.stop());
