export type AuthMode = 'main' | 'demo';
export type NodeEnvironment = 'development' | 'test' | 'production';

export interface Environment {
  nodeEnv: NodeEnvironment;
  authMode: AuthMode;
  mainSiteApiBaseUrl: string;
  authTimeoutMs: number;
  demoUserIds: string[];
}

const deterministicDemoUserIds = [
  'demo-student',
  'demo-admin',
  'demo-sports-lead',
  'demo-captain',
] as const;

function readNodeEnvironment(value: string | undefined): NodeEnvironment {
  if (value === 'production' || value === 'test') return value;
  return 'development';
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('AUTH_TIMEOUT_MS must be a positive integer');
  }
  return parsed;
}

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const nodeEnv = readNodeEnvironment(source.NODE_ENV);
  const authMode = source.AUTH_MODE ?? (nodeEnv === 'production' ? 'main' : 'demo');
  if (authMode !== 'main' && authMode !== 'demo') {
    throw new Error('AUTH_MODE must be main or demo');
  }
  if (nodeEnv === 'production' && authMode === 'demo') {
    throw new Error('Demo authentication is disabled in production');
  }

  const requestedDemoIds = (source.DEMO_USER_IDS ?? deterministicDemoUserIds.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const demoUserIds = [...new Set(requestedDemoIds)].filter((uid) =>
    deterministicDemoUserIds.includes(uid as (typeof deterministicDemoUserIds)[number]),
  );

  return {
    nodeEnv,
    authMode,
    mainSiteApiBaseUrl: (source.MAIN_SITE_API_BASE_URL ?? 'http://localhost:3000').replace(
      /\/+$/,
      '',
    ),
    authTimeoutMs: readPositiveInteger(source.AUTH_TIMEOUT_MS, 3_000),
    demoUserIds,
  };
}
