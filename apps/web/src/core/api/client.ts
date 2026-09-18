import { DEMO_USER_IDS, type DemoUserId, type ApiEnvelope } from '@freebbs-development/contracts';
export { DEMO_USER_IDS, type DemoUserId } from '@freebbs-development/contracts';

export const API_BASE_PATH = '/api/development/v1';
export const AUTH_TOKEN_STORAGE_KEY = 'free_bbs_auth_token';

export type AuthMode = 'main' | 'demo';

interface ApiErrorData {
  error?: { code?: unknown; message?: unknown };
}

export interface ApiClientOptions {
  authMode?: AuthMode;
  selectedDemoUserId?: string;
  fetch?: typeof fetch;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;

  constructor(status: number, code: string, message: string, requestId: string | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

function configuredAuthMode(): AuthMode {
  return import.meta.env.VITE_AUTH_MODE === 'demo' ? 'demo' : 'main';
}

export function isDemoUserId(value: string): value is DemoUserId {
  return (DEMO_USER_IDS as readonly string[]).includes(value);
}

function requireDemoUserId(value: string): DemoUserId {
  if (!isDemoUserId(value)) {
    throw new Error(`Demo user must be selected from the allowlist: ${DEMO_USER_IDS.join(', ')}`);
  }
  return value;
}

function requestPath(path: string): string {
  if (path === API_BASE_PATH || path.startsWith(`${API_BASE_PATH}/`)) return path;
  if (!path.startsWith('/')) return `${API_BASE_PATH}/${path}`;
  return `${API_BASE_PATH}${path}`;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export class ApiClient {
  readonly authMode: AuthMode;
  private readonly fetchImplementation: typeof fetch;
  private selectedDemoUserId: DemoUserId | null;

  constructor(options: ApiClientOptions = {}) {
    this.authMode = options.authMode ?? configuredAuthMode();
    if (this.authMode === 'demo' && import.meta.env.VITE_AUTH_MODE !== 'demo') {
      throw new Error('Demo authentication requires VITE_AUTH_MODE=demo');
    }
    this.selectedDemoUserId =
      this.authMode === 'demo'
        ? requireDemoUserId(options.selectedDemoUserId ?? DEMO_USER_IDS[0])
        : null;
    this.fetchImplementation = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  get demoUser(): DemoUserId | null {
    return this.selectedDemoUserId;
  }

  setDemoUser(userId: string): void {
    if (this.authMode !== 'demo') throw new Error('Demo users are unavailable in main auth mode');
    this.selectedDemoUserId = requireDemoUserId(userId);
  }

  private async fetchResponse(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');

    if (this.authMode === 'demo') {
      headers.delete('Authorization');
      headers.set('X-Demo-User', this.selectedDemoUserId as DemoUserId);
    } else {
      headers.delete('X-Demo-User');
      const token = globalThis.localStorage?.getItem(AUTH_TOKEN_STORAGE_KEY)?.trim();
      if (token) headers.set('Authorization', `Bearer ${token}`);
    }

    return this.fetchImplementation(requestPath(path), {
      ...init,
      method: init.method ?? 'GET',
      headers,
    });
  }

  async download(path: string, init: RequestInit = {}): Promise<Blob> {
    const response = await this.fetchResponse(path, { ...init, cache: 'no-store' });
    if (!response.ok) {
      let envelope: ApiEnvelope<ApiErrorData> | null = null;
      try {
        envelope = (await response.json()) as ApiEnvelope<ApiErrorData>;
      } catch {
        /* Non-JSON proxy errors retain a useful fallback. */
      }
      throw new ApiError(
        response.status,
        stringOr(envelope?.data?.error?.code, 'media_unavailable'),
        stringOr(envelope?.data?.error?.message, '视频暂时无法加载，请重试。'),
        envelope?.requestId ?? null,
      );
    }
    return response.blob();
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchResponse(path, init);

    if (response.status === 204) return undefined as T;

    let envelope: ApiEnvelope<T>;
    try {
      envelope = (await response.json()) as ApiEnvelope<T>;
    } catch {
      throw new ApiError(response.status, 'invalid_response', 'API returned invalid JSON', null);
    }

    if (!response.ok) {
      const errorData = envelope.data as ApiErrorData;
      throw new ApiError(
        response.status,
        stringOr(errorData?.error?.code, 'request_failed'),
        stringOr(errorData?.error?.message, `Request failed with status ${response.status}`),
        stringOr(envelope.requestId, '') || null,
      );
    }
    if (!('data' in envelope)) {
      throw new ApiError(response.status, 'invalid_response', 'API response has no data', null);
    }
    return envelope.data;
  }
}

export function createApiClient(): ApiClient {
  return new ApiClient();
}
