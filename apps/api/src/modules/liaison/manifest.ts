import type { ModuleManifest } from '@freebbs-development/contracts';

export const LIAISON_MANIFEST = {
  id: 'liaison',
  name: '联络资源',
  description: '维护公开、组织内与受限联络资源。',
  route: '/liaison',
  icon: 'liaison',
  ownerTeam: 'liaison',
  status: 'enabled',
  requiredPermissions: ['liaison.resource.read'],
  order: 60,
} as const satisfies ModuleManifest;
