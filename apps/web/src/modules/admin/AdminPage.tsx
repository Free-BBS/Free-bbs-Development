import { useMemo, useState } from 'react';

import { ModulePageHeader } from '../../components/ModulePageHeader.js';
import { createApiClient, type ApiClient } from '../../core/api/client.js';
import { ADMIN_SECTIONS, AdminSectionNav, type AdminSectionId } from './AdminSectionNav.js';
import { AuditLogsSection } from './sections/AuditLogsSection.js';
import { BusinessEntrySection } from './sections/BusinessEntrySection.js';
import { ModulesOwnersSection } from './sections/ModulesOwnersSection.js';
import { RolesPermissionsSection } from './sections/RolesPermissionsSection.js';
import { SubjectsAssignmentsSection } from './sections/SubjectsAssignmentsSection.js';
import { SystemStatusSection } from './sections/SystemStatusSection.js';
import { TagDefinitionsSection } from './sections/TagDefinitionsSection.js';

export interface AdminPageProps {
  client?: Pick<ApiClient, 'request'>;
}

export function AdminPage({ client: suppliedClient }: AdminPageProps = {}) {
  const client = useMemo(() => suppliedClient ?? createApiClient(), [suppliedClient]);
  const [active, setActive] = useState<AdminSectionId>('subjects');

  const content =
    active === 'subjects' ? (
      <SubjectsAssignmentsSection client={client} />
    ) : active === 'roles' ? (
      <RolesPermissionsSection client={client} />
    ) : active === 'tags' ? (
      <TagDefinitionsSection client={client} />
    ) : active === 'modules' ? (
      <ModulesOwnersSection client={client} />
    ) : active === 'business' ? (
      <BusinessEntrySection client={client} />
    ) : active === 'audit' ? (
      <AuditLogsSection client={client} />
    ) : (
      <SystemStatusSection client={client} />
    );
  const current = ADMIN_SECTIONS.find(({ id }) => id === active);

  return (
    <main className="module-page admin-governance-page" aria-label="治理管理台">
      <ModulePageHeader
        kicker="GOVERNANCE DESK"
        title="治理管理台"
        description="集中管理主站身份映射、角色与 Tag 权限、模块责任制，并核对全量审计轨迹。"
      />
      <AdminSectionNav active={active} onChange={setActive} />
      <div
        id={`admin-panel-${active}`}
        role="tabpanel"
        aria-labelledby={`admin-tab-${active}`}
        aria-label={current?.label}
        tabIndex={0}
      >
        {content}
      </div>
    </main>
  );
}
