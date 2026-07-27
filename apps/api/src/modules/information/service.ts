import type { ScopeRef } from '@freebbs-development/contracts';

import { recordAuditEvent } from '../../core/audit/audit-service.js';
import { authorize } from '../../core/authorization/authorize.js';

import type { AuthorizationContext } from '../../core/authorization/policy.js';

import type {
  AnnouncementRecord,
  ConsultationRecord,
  DevelopmentStore,
  ListFilters,
} from '../../core/database/types.js';
import { HttpError } from '../../core/errors/http-error.js';

export type AnnouncementStatus = 'draft' | 'published' | 'archived';
export type ConsultationStatus = 'submitted' | 'triaged' | 'processing' | 'resolved' | 'closed';

export interface AnnouncementInput {
  title: string;
  body: string;
  status: AnnouncementStatus;
  scope: ScopeRef;
}

export type AnnouncementPatch = Partial<AnnouncementInput>;

export interface ConsultationInput {
  title: string;
  body: string;
}

export interface ConsultationPatch {
  title?: string;
  body?: string;
  status?: ConsultationStatus;
}

function publicFilters(filters: ListFilters): ListFilters | null {
  if (filters.status !== undefined && filters.status !== 'published') return null;
  if (filters.scopeType !== undefined && filters.scopeType !== 'public') return null;
  if (filters.scopeId !== undefined && filters.scopeId !== '*') return null;
  return { ...filters, status: 'published', scopeType: 'public', scopeId: '*' };
}

export class InformationService {
  constructor(private readonly store: DevelopmentStore) {}

  async listAnnouncements(
    filters: ListFilters,
    publicOnly: boolean,
  ): Promise<AnnouncementRecord[]> {
    if (!publicOnly) return this.store.announcements.list(filters);
    const applied = publicFilters(filters);
    return applied === null ? [] : this.store.announcements.list(applied);
  }

  async createAnnouncement(
    actorUid: string,
    input: AnnouncementInput,
  ): Promise<AnnouncementRecord> {
    return this.store.transaction(async (transactionStore) => {
      const created = await transactionStore.announcements.create({
        ...input,
        ownerUid: actorUid,
      });
      if (input.status !== 'draft') {
        await recordAuditEvent(transactionStore, {
          actorUid,
          action: 'information.announcement.status_changed',
          resourceType: 'announcement',
          resourceId: created.id,
          details: { from: null, to: input.status, scope: created.scope },
        });
      }
      return created;
    });
  }

  async updateAnnouncement(
    actor: AuthorizationContext,
    id: string,
    patch: AnnouncementPatch,
  ): Promise<AnnouncementRecord | null> {
    return this.store.transaction(async (transactionStore) => {
      const current = await transactionStore.announcements.get(id);
      if (current === null) return null;
      const targetScope = patch.scope ?? current.scope;
      const contentChanged =
        patch.title !== undefined || patch.body !== undefined || patch.scope !== undefined;
      const permitted = (action: string, scope: ScopeRef) =>
        authorize(actor, { action, resource: 'announcement', scope }).allowed;
      if (
        contentChanged &&
        (!permitted('information.announcement.create', current.scope) ||
          !permitted('information.announcement.create', targetScope))
      ) {
        throw new HttpError(404, 'announcement_not_found', 'Announcement not found');
      }
      if (
        (patch.status !== undefined || (contentChanged && current.status === 'published')) &&
        (!permitted('information.announcement.publish', current.scope) ||
          !permitted('information.announcement.publish', targetScope))
      ) {
        throw new HttpError(404, 'announcement_not_found', 'Announcement not found');
      }
      const updated = await transactionStore.announcements.update(id, patch);
      if (updated === null) return null;
      if (patch.status !== undefined && patch.status !== current.status) {
        await recordAuditEvent(transactionStore, {
          actorUid: actor.uid,
          action: 'information.announcement.status_changed',
          resourceType: 'announcement',
          resourceId: id,
          details: { from: current.status, to: patch.status, scope: updated.scope },
        });
      }
      return updated;
    });
  }

  async listConsultations(
    filters: ListFilters,
    requesterUid?: string,
  ): Promise<ConsultationRecord[]> {
    const records = await this.store.consultations.list(filters);
    return requesterUid === undefined
      ? records
      : records.filter((record) => record.requesterUid === requesterUid);
  }

  async createConsultation(
    actorUid: string,
    input: ConsultationInput,
  ): Promise<ConsultationRecord> {
    return this.store.transaction((transactionStore) =>
      transactionStore.consultations.create({
        ...input,
        requesterUid: actorUid,
        assigneeUid: null,
        reply: null,
        status: 'submitted',
        ownerUid: actorUid,
        scope: { type: 'user', id: actorUid },
      }),
    );
  }

  async updateConsultation(
    actor: AuthorizationContext,
    id: string,
    patch: ConsultationPatch,
  ): Promise<ConsultationRecord | null> {
    return this.store.transaction(async (transactionStore) => {
      const current = await transactionStore.consultations.get(id);
      if (current === null) return null;
      const canTriage = authorize(actor, {
        action: 'information.consultation.triage',
        resource: 'consultation',
        scope: current.scope,
      }).allowed;
      const contentChanged = patch.title !== undefined || patch.body !== undefined;
      const canEditOwnSubmitted =
        current.requesterUid === actor.uid &&
        current.status === 'submitted' &&
        authorize(actor, {
          action: 'information.consultation.create',
          resource: 'consultation',
          scope: current.scope,
        }).allowed;
      if (
        (patch.status !== undefined && !canTriage) ||
        (contentChanged && !canTriage && !canEditOwnSubmitted)
      ) {
        throw new HttpError(404, 'consultation_not_found', 'Consultation not found');
      }
      const updated = await transactionStore.consultations.update(id, patch);
      if (updated === null) return null;
      if (patch.status !== undefined && patch.status !== current.status) {
        await recordAuditEvent(transactionStore, {
          actorUid: actor.uid,
          action: 'information.consultation.status_changed',
          resourceType: 'consultation',
          resourceId: id,
          details: { from: current.status, to: patch.status, scope: current.scope },
        });
      }
      return updated;
    });
  }
}
