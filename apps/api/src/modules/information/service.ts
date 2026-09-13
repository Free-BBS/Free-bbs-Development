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
import { canTransition } from '../../core/workflow/state-machine.js';

export type AnnouncementStatus = 'draft' | 'published' | 'archived';
export type ConsultationStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

const ANNOUNCEMENT_TRANSITIONS = {
  draft: ['published'],
  published: ['draft', 'archived'],
  archived: [],
} as const;

const CONSULTATION_TRANSITIONS = {
  open: ['in_progress'],
  in_progress: ['resolved'],
  resolved: ['in_progress', 'closed'],
  closed: [],
} as const;

export interface AnnouncementInput {
  title: string;
  body: string;
  status: 'draft';
  scope: ScopeRef;
}

export interface AnnouncementPatch {
  title?: string;
  body?: string;
  scope?: ScopeRef;
}

export interface ConsultationInput {
  dueAt?: string | null;
  title: string;
  body: string;
}

export interface ConsultationPatch {
  dueAt?: string | null;
  title?: string;
  body?: string;
}

export interface ConsultationHandlingPatch {
  dueAt?: string | null;
  assigneeUid?: string | null;
  reply?: string | null;
}

type TransitionResult<T> =
  | { kind: 'missing' }
  | { kind: 'updated'; record: T }
  | { kind: 'rejected'; from: string; to: string; scope: ScopeRef };

function permitted(
  actor: AuthorizationContext,
  action: string,
  resource: 'announcement' | 'consultation',
  scope: ScopeRef,
): boolean {
  return authorize(actor, { action, resource, scope }).allowed;
}

export class InformationService {
  constructor(private readonly store: DevelopmentStore) {}

  async listAnnouncements(
    filters: ListFilters,
    actor: AuthorizationContext | null,
  ): Promise<AnnouncementRecord[]> {
    const records = await this.store.announcements.list(filters);
    return records.filter(
      (record) =>
        (record.status === 'published' &&
          record.scope.type === 'public' &&
          record.scope.id === '*') ||
        (actor !== null &&
          (permitted(actor, 'information.announcement.create', 'announcement', record.scope) ||
            permitted(actor, 'information.announcement.publish', 'announcement', record.scope))),
    );
  }

  async createAnnouncement(
    actorUid: string,
    input: AnnouncementInput,
  ): Promise<AnnouncementRecord> {
    return this.store.announcements.create({ ...input, ownerUid: actorUid });
  }

  async updateAnnouncement(
    actor: AuthorizationContext,
    id: string,
    patch: AnnouncementPatch,
  ): Promise<AnnouncementRecord | null> {
    return this.store.transaction(async (transactionStore) => {
      const current = await transactionStore.announcements.getForUpdate(id);
      if (current === null) return null;
      const targetScope = patch.scope ?? current.scope;
      if (
        !permitted(actor, 'information.announcement.create', 'announcement', current.scope) ||
        !permitted(actor, 'information.announcement.create', 'announcement', targetScope) ||
        (current.status === 'published' &&
          (!permitted(actor, 'information.announcement.publish', 'announcement', current.scope) ||
            !permitted(actor, 'information.announcement.publish', 'announcement', targetScope)))
      ) {
        throw new HttpError(404, 'announcement_not_found', 'Announcement not found');
      }
      return transactionStore.announcements.update(id, patch);
    });
  }

  async transitionAnnouncement(
    actor: AuthorizationContext,
    id: string,
    to: AnnouncementStatus,
  ): Promise<AnnouncementRecord | null> {
    const result = await this.store.transaction<TransitionResult<AnnouncementRecord>>(
      async (transactionStore) => {
        const current = await transactionStore.announcements.getForUpdate(id);
        if (current === null) return { kind: 'missing' };
        if (!permitted(actor, 'information.announcement.publish', 'announcement', current.scope)) {
          throw new HttpError(404, 'announcement_not_found', 'Announcement not found');
        }
        const from = current.status as AnnouncementStatus;
        if (
          !Object.hasOwn(ANNOUNCEMENT_TRANSITIONS, from) ||
          !canTransition(ANNOUNCEMENT_TRANSITIONS, from, to)
        ) {
          return { kind: 'rejected', from, to, scope: current.scope };
        }
        const updated = await transactionStore.announcements.update(id, { status: to });
        if (updated === null) return { kind: 'missing' };
        await recordAuditEvent(transactionStore, {
          actorUid: actor.uid,
          action: 'information.announcement.status_changed',
          resourceType: 'announcement',
          resourceId: id,
          details: { from, to, outcome: 'accepted', scope: updated.scope },
        });
        return { kind: 'updated', record: updated };
      },
    );
    if (result.kind === 'missing') return null;
    if (result.kind === 'rejected') {
      await recordAuditEvent(this.store, {
        actorUid: actor.uid,
        action: 'information.announcement.status_changed',
        resourceType: 'announcement',
        resourceId: id,
        details: { from: result.from, to: result.to, outcome: 'rejected', scope: result.scope },
      });
      throw new HttpError(409, 'invalid_state_transition', 'Invalid announcement state transition');
    }
    return result.record;
  }

  async listConsultations(
    filters: ListFilters,
    actor: AuthorizationContext,
  ): Promise<ConsultationRecord[]> {
    const records = await this.store.consultations.list(filters);
    return records.filter(
      (record) =>
        record.requesterUid === actor.uid ||
        permitted(actor, 'information.consultation.read', 'consultation', record.scope) ||
        permitted(actor, 'information.consultation.triage', 'consultation', record.scope),
    );
  }

  async createConsultation(
    actorUid: string,
    input: ConsultationInput,
  ): Promise<ConsultationRecord> {
    return this.store.consultations.create({
      ...input,
      requesterUid: actorUid,
      assigneeUid: null,
      reply: null,
      status: 'open',
      ownerUid: actorUid,
      scope: { type: 'user', id: actorUid },
    });
  }

  async updateConsultation(
    actor: AuthorizationContext,
    id: string,
    patch: ConsultationPatch,
  ): Promise<ConsultationRecord | null> {
    return this.store.transaction(async (transactionStore) => {
      const current = await transactionStore.consultations.getForUpdate(id);
      if (current === null) return null;
      const canEditOwnOpen =
        current.requesterUid === actor.uid &&
        current.status === 'open' &&
        permitted(actor, 'information.consultation.create', 'consultation', current.scope);
      if (!canEditOwnOpen) {
        throw new HttpError(404, 'consultation_not_found', 'Consultation not found');
      }
      return transactionStore.consultations.update(id, patch);
    });
  }

  async updateConsultationHandling(
    actor: AuthorizationContext,
    id: string,
    patch: ConsultationHandlingPatch,
  ): Promise<ConsultationRecord | null> {
    return this.store.transaction(async (transactionStore) => {
      const current = await transactionStore.consultations.getForUpdate(id);
      if (current === null) return null;
      if (!permitted(actor, 'information.consultation.triage', 'consultation', current.scope)) {
        throw new HttpError(404, 'consultation_not_found', 'Consultation not found');
      }
      if (patch.assigneeUid !== undefined && patch.assigneeUid !== null) {
        const subjects = await transactionStore.subjects.list({ query: patch.assigneeUid });
        if (!subjects.some((subject) => subject.uid === patch.assigneeUid)) {
          throw new HttpError(400, 'invalid_assignee', 'Assignee does not exist');
        }
      }
      const updated = await transactionStore.consultations.update(id, patch);
      if (updated === null) return null;
      await recordAuditEvent(transactionStore, {
        actorUid: actor.uid,
        action: 'information.consultation.handling_updated',
        resourceType: 'consultation',
        resourceId: id,
        details: { fields: Object.keys(patch).sort(), scope: current.scope },
      });
      return updated;
    });
  }

  async transitionConsultation(
    actor: AuthorizationContext,
    id: string,
    to: ConsultationStatus,
  ): Promise<ConsultationRecord | null> {
    const result = await this.store.transaction<TransitionResult<ConsultationRecord>>(
      async (transactionStore) => {
        const current = await transactionStore.consultations.getForUpdate(id);
        if (current === null) return { kind: 'missing' };
        if (!permitted(actor, 'information.consultation.triage', 'consultation', current.scope)) {
          throw new HttpError(404, 'consultation_not_found', 'Consultation not found');
        }
        const from = current.status as ConsultationStatus;
        if (
          !Object.hasOwn(CONSULTATION_TRANSITIONS, from) ||
          !canTransition(CONSULTATION_TRANSITIONS, from, to)
        ) {
          return { kind: 'rejected', from, to, scope: current.scope };
        }
        const updated = await transactionStore.consultations.update(id, { status: to });
        if (updated === null) return { kind: 'missing' };
        await recordAuditEvent(transactionStore, {
          actorUid: actor.uid,
          action: 'information.consultation.status_changed',
          resourceType: 'consultation',
          resourceId: id,
          details: { from, to, outcome: 'accepted', scope: current.scope },
        });
        return { kind: 'updated', record: updated };
      },
    );
    if (result.kind === 'missing') return null;
    if (result.kind === 'rejected') {
      await recordAuditEvent(this.store, {
        actorUid: actor.uid,
        action: 'information.consultation.status_changed',
        resourceType: 'consultation',
        resourceId: id,
        details: { from: result.from, to: result.to, outcome: 'rejected', scope: result.scope },
      });
      throw new HttpError(409, 'invalid_state_transition', 'Invalid consultation state transition');
    }
    return result.record;
  }
}
