import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMySqlStore, type MySqlStoreHandle } from './mysql-store.js';
import { RecordConflictError } from './record-conflict-error.js';

const runMySql = process.env.DATA_MODE?.trim() === 'mysql';
const integration = runMySql ? describe : describe.skip;
const runId = `mysql-integration-${randomUUID()}`;
const publicScope = { type: 'public', id: '*' } as const;
let handle: MySqlStoreHandle;

async function cleanCreatedRecords(): Promise<void> {
  for (const table of [
    'finance_records',
    'liaison_resources',
    'sports_checkins',
    'sports_team_members',
    'activity_registrations',
    'activities',
    'club_memberships',
    'sports_teams',
    'clubs',
    'subjects',
  ]) {
    await handle.pool.execute(`DELETE FROM ${table} WHERE owner_uid = ?`, [runId]);
  }
}

integration('real MySQL 8 store integration', () => {
  beforeAll(async () => {
    handle = createMySqlStore({ environment: process.env });
    await handle.checkReadiness();
    for (const uid of [`${runId}-member`, `${runId}-participant`]) {
      await handle.store.subjects.create({
        uid,
        displayName: uid,
        avatarUrl: null,
        status: 'active',
        ownerUid: runId,
        scope: publicScope,
      });
    }
  });

  afterAll(async () => {
    if (!handle) return;
    try {
      await cleanCreatedRecords();
    } finally {
      await handle.close();
    }
  });

  it('performs a complete CRUD round-trip through the MySQL store', async () => {
    const created = await handle.store.liaisonResources.create({
      name: 'MySQL integration liaison',
      description: runId,
      category: 'integration',
      visibility: 'restricted',
      status: 'active',
      ownerUid: runId,
      scope: publicScope,
    });
    await expect(handle.store.liaisonResources.get(created.id)).resolves.toMatchObject({
      name: 'MySQL integration liaison',
    });
    await expect(
      handle.store.liaisonResources.update(created.id, { name: 'MySQL integration updated' }),
    ).resolves.toMatchObject({ name: 'MySQL integration updated' });
    await expect(handle.store.liaisonResources.delete(created.id)).resolves.toBe(true);
    await expect(handle.store.liaisonResources.get(created.id)).resolves.toBeNull();
  });
  it('round-trips UTC time, date-only and integer cents while enforcing unique domain records', async () => {
    const club = await handle.store.clubs.create({
      name: 'MySQL integration club',
      description: runId,
      technicalSupportStatus: 'not_requested',
      technicalSupportNote: null,
      status: 'active',
      ownerUid: runId,
      scope: publicScope,
    });
    const membershipInput = {
      clubId: club.id,
      memberUid: `${runId}-member`,
      status: 'active',
      ownerUid: runId,
      scope: { type: 'club', id: club.id },
    } as const;
    await handle.store.clubMemberships.create(membershipInput);
    await expect(handle.store.clubMemberships.create(membershipInput)).rejects.toBeInstanceOf(
      RecordConflictError,
    );

    const startsAt = '2026-07-22T03:04:05.006Z';
    const activity = await handle.store.activities.create({
      title: 'MySQL integration activity',
      description: runId,
      clubId: club.id,
      startsAt,
      technicalSupportStatus: 'not_requested',
      technicalSupportNote: null,
      status: 'published',
      ownerUid: runId,
      scope: { type: 'club', id: club.id },
    });
    expect((await handle.store.activities.get(activity.id))?.startsAt).toBe(startsAt);

    const registrationInput = {
      activityId: activity.id,
      participantUid: `${runId}-participant`,
      status: 'registered',
      ownerUid: runId,
      scope: { type: 'activity', id: activity.id },
    } as const;
    await handle.store.activityRegistrations.create(registrationInput);
    await expect(
      handle.store.activityRegistrations.create(registrationInput),
    ).rejects.toBeInstanceOf(RecordConflictError);

    const team = await handle.store.sportsTeams.create({
      name: 'MySQL integration team',
      description: runId,
      status: 'active',
      ownerUid: runId,
      scope: publicScope,
    });
    const checkinInput = {
      teamId: team.id,
      memberUid: `${runId}-member`,
      checkinDate: '2026-07-22',
      status: 'present',
      ownerUid: runId,
      scope: { type: 'sports_team', id: team.id },
    } as const;
    const checkin = await handle.store.sportsCheckins.create(checkinInput);
    expect((await handle.store.sportsCheckins.get(checkin.id))?.checkinDate).toBe('2026-07-22');
    await expect(handle.store.sportsCheckins.create(checkinInput)).rejects.toBeInstanceOf(
      RecordConflictError,
    );

    const finance = await handle.store.financeRecords.create({
      title: 'MySQL integration budget',
      kind: 'budget',
      amountCents: 123_456_789,
      activityId: activity.id,
      status: 'draft',
      ownerUid: runId,
      scope: publicScope,
    });
    expect((await handle.store.financeRecords.get(finance.id))?.amountCents).toBe(123_456_789);
  });

  it('rejects orphan club, activity, team and finance references', async () => {
    const memberUid = `${runId}-member`;
    const participantUid = `${runId}-participant`;
    const missingId = `${runId}-missing`;
    const foreignKeyFailure = { code: 'ER_NO_REFERENCED_ROW_2' };

    await expect(
      handle.store.clubMemberships.create({
        clubId: missingId,
        memberUid,
        status: 'active',
        ownerUid: runId,
        scope: publicScope,
      }),
    ).rejects.toMatchObject(foreignKeyFailure);
    await expect(
      handle.store.activities.create({
        title: 'Orphan activity',
        description: runId,
        clubId: missingId,
        startsAt: null,
        technicalSupportStatus: 'not_requested',
        technicalSupportNote: null,
        status: 'draft',
        ownerUid: runId,
        scope: publicScope,
      }),
    ).rejects.toMatchObject(foreignKeyFailure);
    await expect(
      handle.store.activityRegistrations.create({
        activityId: missingId,
        participantUid,
        status: 'registered',
        ownerUid: runId,
        scope: publicScope,
      }),
    ).rejects.toMatchObject(foreignKeyFailure);
    await expect(
      handle.store.sportsCheckins.create({
        teamId: missingId,
        memberUid,
        checkinDate: '2026-07-23',
        status: 'present',
        ownerUid: runId,
        scope: publicScope,
      }),
    ).rejects.toMatchObject(foreignKeyFailure);
    await expect(
      handle.store.financeRecords.create({
        title: 'Orphan finance record',
        kind: 'settlement',
        amountCents: 1,
        activityId: missingId,
        status: 'draft',
        ownerUid: runId,
        scope: publicScope,
      }),
    ).rejects.toMatchObject(foreignKeyFailure);
  });
});
