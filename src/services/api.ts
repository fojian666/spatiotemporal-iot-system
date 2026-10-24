import type { DeviceStatus, Reading } from '../data/devices';
import type { ScenarioKey } from '../data/scenarios';
import type { AlertItem, LinkStatus, SimEvent, SimStats, TrendPoint } from '../engine/simulation';
import { clearAuthToken, getAuthToken } from './authToken';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface MqttStatus {
  connected: boolean;
  messagesReceived: number;
  messagesPublished: number;
  host: string;
  lastError?: string | null;
}

export interface ServerSnapshot {
  server_time: string;
  data_time: string;
  scenario_key: ScenarioKey;
  running: boolean;
  speed: number;
  tick: number;
  readings: Record<string, Reading>;
  statuses: Record<string, DeviceStatus>;
  history: TrendPoint[];
  alerts: AlertItem[];
  events: SimEvent[];
  stats: SimStats;
  mqtt: MqttStatus;
}

export interface ApiDevice {
  id: string;
  name: string;
  shortName: string;
  kind: string;
  zone: string;
  status: DeviceStatus;
  lng: number;
  lat: number;
  metrics: unknown[];
}

export interface BootstrapPayload extends ServerSnapshot {
  devices: ApiDevice[];
  server: {
    name: string;
    version: string;
    timezone: string;
  };
}

export const REMOTE_ENABLED = import.meta.env.VITE_DATA_SOURCE === 'api';
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'https://127.0.0.1:8443').replace(/\/$/, '');
export const AUTH_EXPIRED_EVENT = 'iot-auth-expired';

export type UserRole = 'admin' | 'operator' | 'viewer';

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

const REQUEST_TIMEOUT_MS = 15_000;

function withTimeout(timeoutMs: number, external?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      window.clearTimeout(timer);
      external?.removeEventListener('abort', onAbort);
    },
  };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const timeout = withTimeout(REQUEST_TIMEOUT_MS, options?.signal ?? undefined);
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: timeout.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.headers ?? {}),
      },
    });
  } catch (reason) {
    if (timeout.didTimeout()) {
      throw new ApiError(0, '请求超时，请检查后端是否在线');
    }
    if (options?.signal?.aborted) throw reason;
    throw new ApiError(0, '无法连接服务端，请检查后端与网络');
  } finally {
    timeout.dispose();
  }
  if (!response.ok) {
    const raw = await response.text();
    let message = raw || `请求失败 (${response.status})`;
    try {
      const payload = JSON.parse(raw) as { detail?: string };
      if (payload.detail) message = payload.detail;
    } catch {
      // Keep the raw response text when it is not JSON.
    }
    if (response.status === 401 && path !== '/api/auth/login' && token) {
      clearAuthToken();
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }
    throw new ApiError(response.status, message);
  }
  return (await response.json()) as T;
}

export async function loginRequest(username: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

export async function demoLoginRequest(role: UserRole): Promise<LoginResponse> {
  return request<LoginResponse>('/api/auth/demo-login', {
    method: 'POST',
    body: JSON.stringify({ role }),
  });
}

export interface DemoRoleInfo {
  role: UserRole;
  username: string;
  displayName: string;
}

export async function fetchDemoRoles(signal?: AbortSignal): Promise<{ enabled: boolean; roles: DemoRoleInfo[] }> {
  return request('/api/auth/demo-roles', { signal });
}

export async function fetchMe(signal?: AbortSignal): Promise<AuthUser> {
  return request<AuthUser>('/api/auth/me', { signal });
}

export async function fetchWsTicket(): Promise<{ ticket: string; expires_in: number }> {
  return request('/api/auth/ws-ticket', { method: 'POST' });
}

export async function logoutRequest(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' });
}

export async function fetchBootstrap(signal?: AbortSignal): Promise<BootstrapPayload> {
  return request<BootstrapPayload>('/api/bootstrap', { signal });
}

export async function fetchHealth(signal?: AbortSignal): Promise<Record<string, unknown>> {
  return request('/api/health', { signal });
}

export async function postScenario(key: ScenarioKey): Promise<ServerSnapshot> {
  return request<ServerSnapshot>(`/api/scenarios/${key}`, { method: 'POST' });
}

export async function postSimulationState(payload: {
  running?: boolean;
  speed?: number;
}): Promise<ServerSnapshot> {
  return request<ServerSnapshot>('/api/simulation/state', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function postAlertAck(alertId: string): Promise<ServerSnapshot> {
  return request<ServerSnapshot>(`/api/alerts/${alertId}/ack`, { method: 'POST' });
}

export function connectTelemetrySocket(
  onSnapshot: (snapshot: ServerSnapshot) => void,
  onStatus: (status: Exclude<LinkStatus, 'local'>) => void,
): () => void {
  let active = true;
  let socket: WebSocket | null = null;
  let retryTimer: number | undefined;
  const wsBase = API_BASE.replace(/^http/, 'ws');

  const connect = async () => {
    if (!active) return;
    onStatus('connecting');
    try {
      const { ticket } = await fetchWsTicket();
      if (!active) return;
      socket = new WebSocket(`${wsBase}/ws/telemetry?ticket=${encodeURIComponent(ticket)}`);
      socket.onopen = () => {
        if (active) onStatus('live');
      };
      socket.onmessage = (event) => {
        try {
          onSnapshot(JSON.parse(event.data) as ServerSnapshot);
          if (active) onStatus('live');
        } catch (error) {
          console.error('Invalid telemetry snapshot', error);
        }
      };
      socket.onerror = () => {
        if (active) onStatus('reconnecting');
      };
      socket.onclose = () => {
        if (!active) return;
        onStatus('reconnecting');
        retryTimer = window.setTimeout(() => void connect(), 1500);
      };
    } catch (error) {
      if (!active) return;
      onStatus('reconnecting');
      retryTimer = window.setTimeout(() => void connect(), 1800);
      console.error('Unable to obtain websocket ticket', error);
    }
  };

  void connect();

  return () => {
    active = false;
    if (retryTimer) window.clearTimeout(retryTimer);
    socket?.close();
  };
}


// ---------------- drone operations ----------------

export interface DroneWaypoint {
  lng: number;
  lat: number;
  altitude: number;
  action: string;
  name?: string | null;
}

export interface DroneRoute {
  id: string;
  name: string;
  routeType: string;
  deviceId: string;
  waypoints: DroneWaypoint[];
  altitude: number;
  speed: number;
  gimbalPitch: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlightPlan {
  id: string;
  name: string;
  routeId: string;
  routeName: string;
  deviceId: string;
  taskType: string;
  status: string;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
  mediaUploaded: number;
  mediaTotal: number;
  createdAt: string;
}

export interface MediaAsset {
  id: string;
  name: string;
  mediaType: 'image' | 'video' | 'archive' | string;
  url: string;
  planId: string | null;
  planName: string | null;
  routeName: string | null;
  sizeBytes: number;
  resolution: string;
  capturedAt: string;
  lng: number;
  lat: number;
  heading: number;
  pitch: number;
  altitude: number;
}

export interface AiClue {
  id: string;
  title: string;
  modelId: string;
  planId: string | null;
  routeName: string | null;
  status: '待处理' | '已核实' | '已忽略';
  objectCount: number;
  capturedAt: string;
  mediaId: string | null;
  lng: number;
  lat: number;
}

export interface AiModel {
  id: string;
  name: string;
  version: string;
  target: string;
  status: string;
  description: string;
}

export interface FlightCommand {
  id: number;
  planId: string;
  command: string;
  actor: string;
  detail: string | null;
  createdAt: string;
}

export interface DroneDeviceCard {
  id: string;
  name: string;
  shortName: string;
  kind: string;
  zone: string;
  protocol: string;
  model: string;
  status: DeviceStatus;
  battery: number;
  signal: number;
  lat: number;
  lng: number;
  reading: Reading;
  onlineSince?: string | null;
  note?: string | null;
}

export interface DroneOverview {
  serverTime: string;
  fleet: {
    airports: DroneDeviceCard[];
    nonAirport: DroneDeviceCard[];
    ground: DroneDeviceCard[];
  };
  counts: {
    airports: number;
    nonAirport: number;
    ground: number;
    routes: number;
    plans: number;
    activePlans: number;
    completedPlans: number;
    media: number;
    clues: number;
    pendingClues: number;
  };
  routes: DroneRoute[];
  plans: FlightPlan[];
  media: MediaAsset[];
  clues: AiClue[];
  models: AiModel[];
  commands: FlightCommand[];
  mqtt: MqttStatus;
}

export async function fetchDroneOverview(signal?: AbortSignal): Promise<DroneOverview> {
  return request<DroneOverview>('/api/drone/overview', { signal });
}

export async function saveDroneRoute(
  payload: {
    name: string;
    route_type: string;
    device_id: string;
    waypoints: { lng: number; lat: number; altitude: number; action: string; name?: string | null }[];
    altitude: number;
    speed: number;
    gimbal_pitch: number;
  },
  routeId?: string,
): Promise<DroneRoute> {
  const path = routeId ? `/api/drone/routes/${routeId}` : '/api/drone/routes';
  return request<DroneRoute>(path, {
    method: routeId ? 'PUT' : 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteDroneRoute(routeId: string): Promise<void> {
  await request(`/api/drone/routes/${routeId}`, { method: 'DELETE' });
}

export async function createDronePlan(payload: {
  name: string;
  route_id: string;
  device_id: string;
  task_type: string;
  planned_start: string;
  planned_end: string;
}): Promise<FlightPlan> {
  return request<FlightPlan>('/api/drone/plans', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function sendDroneCommand(
  planId: string,
  command: 'takeoff' | 'pause' | 'resume' | 'hover' | 'return' | 'land' | 'complete' | 'fail',
  detail?: string,
): Promise<{ plan: FlightPlan; command: FlightCommand }> {
  return request(`/api/drone/plans/${planId}/command`, {
    method: 'POST',
    body: JSON.stringify({ command, detail }),
  });
}

export async function updateDroneClue(clueId: string, status: AiClue['status']): Promise<AiClue> {
  return request<AiClue>(`/api/drone/clues/${clueId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
