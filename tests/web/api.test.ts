import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, AUTH_EXPIRED_EVENT, fetchMe, fetchBootstrap, loginRequest, copilotChat, connectTelemetrySocket } from '../../src/services/api';
import { setAuthToken, getAuthToken } from '../../src/services/authToken';

beforeEach(() => setAuthToken('test-only-token'));

it('sends the session token, keeps transient failures from logging out', async () => {
  const fetch = vi.fn().mockRejectedValue(new TypeError('network'));
  vi.stubGlobal('fetch', fetch);
  await expect(fetchMe()).rejects.toMatchObject({ status: 0 });
  expect(getAuthToken()).toBe('test-only-token');
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-only-token');
});

it('expires a session on authenticated 401, but not bad login or 403', async () => {
  const expired = vi.fn();
  window.addEventListener(AUTH_EXPIRED_EVENT, expired);
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response('{"detail":"denied"}', { status: 401 }))));
  await expect(loginRequest('bad', 'bad')).rejects.toMatchObject({ status: 401 });
  expect(getAuthToken()).toBe('test-only-token');
  await expect(fetchMe()).rejects.toMatchObject({ status: 401, message: 'denied' });
  expect(getAuthToken()).toBeNull();
  expect(expired).toHaveBeenCalledOnce();
  window.removeEventListener(AUTH_EXPIRED_EVENT, expired);
  setAuthToken('new');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('forbidden', { status: 403 })));
  await expect(fetchMe()).rejects.toMatchObject({ status: 403 });
  expect(getAuthToken()).toBe('new');
});

function abortableFetch() {
  const fetch = vi.fn((_url, options) => new Promise((_resolve, reject) => {
    if (options.signal.aborted) reject(new DOMException('aborted', 'AbortError'));
    else options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

it('uses 15s ordinary timeout and 30s Copilot budget', async () => {
  vi.useFakeTimers();
  abortableFetch();
  const ordinary = expect(fetchMe()).rejects.toMatchObject({ status: 0, message: expect.stringContaining('超时') });
  const cloud = copilotChat('question', 'WQ-04');
  const rejected = expect(cloud).rejects.toBeInstanceOf(ApiError);
  let cloudFinished = false;
  void cloud.catch(() => { cloudFinished = true; });
  await vi.advanceTimersByTimeAsync(15000);
  await ordinary;
  expect(cloudFinished).toBe(false);
  await vi.advanceTimersByTimeAsync(15000);
  await rejected;
  expect(getAuthToken()).toBe('test-only-token');
  expect(vi.getTimerCount()).toBe(0);
});

it('forwards external cancellation and clears timeout timers', async () => {
  vi.useFakeTimers();
  const fetch = abortableFetch();
  const controller = new AbortController();
  const promise = expect(fetchBootstrap(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await promise;
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('only sends query and focus to cloud, never client telemetry or credentials in body', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{"text":"ok"}'));
  vi.stubGlobal('fetch', fetch);
  await copilotChat('question', 'WQ-04');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ query: 'question', focus_device: 'WQ-04' });
});

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen?: () => void;
  onclose?: () => void;
  onerror?: () => void;
  onmessage?: (event: { data: string }) => void;
  close = vi.fn(() => this.onclose?.());
  constructor(public url: string) { FakeSocket.instances.push(this); }
}

describe('telemetry reconnection lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response('{"ticket":"one-use"}'))));
  });
  it('uses a ticket, reconnects and stops after cleanup', async () => {
    const snapshot = vi.fn(), status = vi.fn();
    const stop = connectTelemetrySocket(snapshot, status);
    await vi.advanceTimersByTimeAsync(0);
    const socket = FakeSocket.instances[0];
    expect(socket.url).toContain('ticket=one-use');
    expect(socket.url).not.toContain('test-only-token');
    socket.onopen?.();
    socket.onmessage?.({ data: '{"tick":1}' });
    expect(snapshot).toHaveBeenCalledWith({ tick: 1 });
    expect(status).toHaveBeenLastCalledWith('live');
    socket.onclose?.();
    await vi.advanceTimersByTimeAsync(1500);
    expect(FakeSocket.instances).toHaveLength(2);
    stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(FakeSocket.instances).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('retries ticket errors without clearing the session', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const stop = connectTelemetrySocket(vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(1800);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(getAuthToken()).toBe('test-only-token');
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
