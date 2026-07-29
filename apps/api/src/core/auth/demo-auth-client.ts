import type { UserContext } from '@freebbs-development/contracts';
import type { AuthClient } from './auth-client.js';

const demoUsers: Readonly<Record<string, Pick<UserContext, 'displayName' | 'avatarUrl'>>> = {
  'demo-student': { displayName: '普通同学', avatarUrl: null },
  'demo-admin': { displayName: '发展端管理员', avatarUrl: null },
  'demo-rights-member': { displayName: '权益发展中心部员', avatarUrl: null },
  'demo-liaison-member': { displayName: '联络中心部员', avatarUrl: null },
  'demo-sports-lead': { displayName: '体育负责人', avatarUrl: null },
  'demo-sports-director': { displayName: '体育中心部长', avatarUrl: null },
  'demo-captain': { displayName: '篮球队队长', avatarUrl: null },
  'demo-tuanwei-lead': { displayName: '团委负责人', avatarUrl: null },
};

export class DemoAuthClient implements AuthClient {
  private readonly allowedUserIds: ReadonlySet<string>;

  constructor(allowedUserIds: readonly string[]) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Demo authentication is disabled in production');
    }
    this.allowedUserIds = new Set(allowedUserIds);
  }

  async introspect(uid: string): Promise<UserContext | null> {
    const profile = demoUsers[uid];
    if (!this.allowedUserIds.has(uid) || profile === undefined) return null;
    return {
      uid,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      baseRole: 'student',
      roles: [],
      tags: [],
    };
  }
}
