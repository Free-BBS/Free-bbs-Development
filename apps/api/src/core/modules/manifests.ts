import type { ModuleManifest } from '@freebbs-development/contracts';
import { INFORMATION_MANIFEST } from '../../modules/information/manifest.js';
import { KNOWLEDGE_MANIFEST } from '../../modules/knowledge/manifest.js';
import { LIAISON_MANIFEST } from '../../modules/liaison/manifest.js';

export const MODULE_MANIFESTS: readonly ModuleManifest[] = [
  {
    id: 'dashboard',
    name: '工作台',
    description: '汇总平台入口、动态与待办。',
    route: '/dashboard',
    icon: 'dashboard',
    ownerTeam: 'platform-core',
    status: 'enabled',
    requiredPermissions: ['dashboard.read'],
    order: 10,
  },
  KNOWLEDGE_MANIFEST,

  INFORMATION_MANIFEST,

  {
    id: 'clubs',
    name: '社群与俱乐部',
    description: '建设和维护学生社群与俱乐部。',
    route: '/clubs',
    icon: 'clubs',
    ownerTeam: 'arts',
    status: 'enabled',
    requiredPermissions: ['clubs.read'],
    order: 40,
  },
  {
    id: 'events',
    name: '活动',
    description: '规范活动创建、报名与复盘流程。',
    route: '/events',
    icon: 'events',
    ownerTeam: 'cross-domain',
    status: 'enabled',
    requiredPermissions: ['events.read'],
    order: 50,
  },
  LIAISON_MANIFEST,

  {
    id: 'sports',
    name: '体育代表队',
    description: '管理代表队、队员和训练签到。',
    route: '/sports',
    icon: 'sports',
    ownerTeam: 'sports',
    status: 'enabled',
    requiredPermissions: ['sports.team.read'],
    order: 70,
  },
  {
    id: 'finance',
    name: '财务治理',
    description: '以可审计方式管理预算与结算。',
    route: '/finance',
    icon: 'finance',
    ownerTeam: 'rights-development',
    status: 'enabled',
    requiredPermissions: ['finance.record.read'],
    order: 80,
  },
  {
    id: 'admin',
    name: '权限与模块管理',
    description: '管理模块、角色、标签与审计记录。',
    route: '/admin',
    icon: 'admin',
    ownerTeam: 'platform-core',
    status: 'enabled',
    requiredPermissions: ['admin.manage'],
    order: 90,
  },
] as const;
