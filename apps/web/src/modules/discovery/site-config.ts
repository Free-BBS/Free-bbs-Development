export const KIND_LABELS = { activity: '活动', club: '趣缘群体', knowledge: '经验' } as const;
export type DiscoveryKind = keyof typeof KIND_LABELS;
export interface DiscoveryConfig {
  enabled: boolean;
  allowedKinds: readonly DiscoveryKind[];
  excludedKeys: readonly string[];
  suggestedInterests: readonly string[];
}

// Site-wide editorial controls. Keys use activity:<id>, club:<id>, knowledge:<id>.
export const DISCOVERY_CONFIG: DiscoveryConfig = {
  enabled: true,
  allowedKinds: ['activity', 'club', 'knowledge'],
  excludedKeys: [],
  suggestedInterests: ['运动', '音乐', '摄影', '科创', '志愿', '读书'],
};

export function safeMapUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export const FREE_BBS_MAP_URL = safeMapUrl(import.meta.env.VITE_FREE_BBS_MAP_URL);
