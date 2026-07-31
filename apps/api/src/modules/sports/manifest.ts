import type { ModuleManifest } from '@freebbs-development/contracts';

export const SPORTS_MANIFEST = {
  id: 'sports',
  name: 'Sports teams',
  description: 'Manage public team summaries and scoped training check-ins.',
  route: '/sports',
  icon: 'sports',
  ownerTeam: 'sports',
  status: 'enabled',
  requiredPermissions: ['sports.team.read'],
  order: 70,
} as const satisfies ModuleManifest;
