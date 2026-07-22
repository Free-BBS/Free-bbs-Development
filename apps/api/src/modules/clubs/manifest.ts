import type { ModuleManifest } from '@freebbs-development/contracts';

export const CLUBS_MANIFEST = {
  id: 'clubs',
  name: 'Clubs and communities',
  description: 'Create, maintain, join, and leave student clubs.',
  route: '/clubs',
  icon: 'clubs',
  ownerTeam: 'arts',
  status: 'enabled',
  requiredPermissions: ['clubs.read'],
  order: 40,
} as const satisfies ModuleManifest;
