import type { RoleKey } from './modules.js';
import type { PermissionTag } from './permissions.js';

export type BaseRole = 'student';

export interface UserContext {
  uid: string;
  displayName: string;
  avatarUrl: string | null;
  baseRole: BaseRole;
  roles: RoleKey[];
  tags: PermissionTag[];
}

export interface ApiEnvelope<T> {
  data: T;
  requestId: string;
}
