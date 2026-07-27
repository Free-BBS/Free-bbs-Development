import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app.js';
import { DemoAuthClient } from '../../core/auth/demo-auth-client.js';
import { createMemoryStore } from '../../core/database/memory-store.js';

import type { DevelopmentStore } from '../../core/database/types.js';

const adminHeaders = { 'X-Demo-User': 'demo-admin' };
const studentHeaders = { 'X-Demo-User': 'demo-student' };

function informationApp(store = createMemoryStore()) {
  return {
    app: createApp({
      store,
      databaseMode: 'memory',
      authMode: 'demo',
      authClient: new DemoAuthClient(['demo-admin', 'demo-student']),
    }),
    store,
  };
}

async function addAnnouncement(
  store: DevelopmentStore,
  overrides: Partial<Parameters<DevelopmentStore['announcements']['create']>[0]> = {},
) {
  return store.announcements.create({
    title: '测试公告',
    body: '只用于路由边界测试。',
    status: 'draft',
    ownerUid: 'seed-owner',
    scope: { type: 'public', id: '*' },
    ...overrides,
  });
}

describe('information API', () => {
  it('lets anonymous callers read only public published announcements', async () => {
    const { app, store } = informationApp();
    await addAnnouncement(store, { title: '公开公告草稿' });
    await addAnnouncement(store, {
      title: '组织内发布公告',
      status: 'published',
      scope: { type: 'organization', id: 'org-secret' },
    });

    const response = await request(app)
      .get('/api/development/v1/information/announcements')
      .expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    expect(
      response.body.data.every(
        (announcement: { status: string; scope: { type: string; id: string } }) =>
          announcement.status === 'published' &&
          announcement.scope.type === 'public' &&
          announcement.scope.id === '*',
      ),
    ).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain('公开公告草稿');
    expect(JSON.stringify(response.body)).not.toContain('组织内发布公告');
  });

  it('lets an ordinary student submit a consultation with server-owned identity and scope', async () => {
    const { app } = informationApp();

    await request(app)
      .post('/api/development/v1/information/consultations')
      .set(studentHeaders)
      .send({
        title: '伪造请求人',
        body: '客户端不能指定 requesterUid。',
        requesterUid: 'spoofed-user',
      })
      .expect(400);

    const created = await request(app)
      .post('/api/development/v1/information/consultations')
      .set(studentHeaders)
      .send({ title: '食堂开放时间建议', body: '希望考试周延长晚间开放时间。' })
      .expect(201);

    expect(created.body).toMatchObject({
      data: {
        title: '食堂开放时间建议',
        status: 'submitted',
        requesterUid: 'demo-student',
        ownerUid: 'demo-student',
        scope: { type: 'user', id: 'demo-student' },
      },
      requestId: expect.any(String),
    });
  });

  it('publishes announcements and advances consultation status with transactional audits', async () => {
    const { app, store } = informationApp();
    const announcement = await addAnnouncement(store, { title: '待发布公告' });
    const consultation = await store.consultations.create({
      title: '待分流咨询',
      body: '需要权益团队处理。',
      requesterUid: 'demo-student',
      assigneeUid: null,
      reply: null,
      status: 'submitted',
      ownerUid: 'demo-student',
      scope: { type: 'user', id: 'demo-student' },
    });

    await request(app)
      .patch('/api/development/v1/information/announcements')
      .set(adminHeaders)
      .send({ id: announcement.id, status: 'published' })
      .expect(200);
    await request(app)
      .patch('/api/development/v1/information/consultations')
      .set(adminHeaders)
      .send({ id: consultation.id, status: 'triaged' })
      .expect(200);

    const audit = await store.auditLogs.list();
    expect(audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'information.announcement.status_changed',
          resourceId: announcement.id,
        }),
        expect.objectContaining({
          action: 'information.consultation.status_changed',
          resourceId: consultation.id,
        }),
      ]),
    );
  });

  it('limits consultation listings with server-side requester and scope filters', async () => {
    const { app, store } = informationApp();
    await store.consultations.create({
      title: '其他用户的私有咨询',
      body: '不能返回给普通学生。',
      requesterUid: 'another-user',
      assigneeUid: null,
      reply: null,
      status: 'submitted',
      ownerUid: 'another-user',
      scope: { type: 'user', id: 'another-user' },
    });

    const studentList = await request(app)
      .get('/api/development/v1/information/consultations')
      .set(studentHeaders)
      .expect(200);
    expect(
      studentList.body.data.every(
        (consultation: { requesterUid: string }) => consultation.requesterUid === 'demo-student',
      ),
    ).toBe(true);
    expect(JSON.stringify(studentList.body)).not.toContain('其他用户的私有咨询');

    const adminList = await request(app)
      .get(
        '/api/development/v1/information/consultations?status=submitted&scopeType=user&scopeId=another-user',
      )
      .set(adminHeaders)
      .expect(200);
    expect(adminList.body.data).toEqual([
      expect.objectContaining({ requesterUid: 'another-user', status: 'submitted' }),
    ]);
  });

  it('fails closed when the information module is disabled', async () => {
    const { app, store } = informationApp();
    const moduleRecord = (await store.modules.list({ query: 'information' })).find(
      (record) => record.moduleId === 'information',
    );
    expect(moduleRecord).toBeDefined();
    await store.modules.update(moduleRecord!.id, { enabled: false, status: 'disabled' });

    await request(app).get('/api/development/v1/information/announcements').expect(503);
  });
});
