INSERT INTO subjects
  (id, uid, display_name, avatar_url, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('subject-admin', 'demo-admin', '发展端管理员', NULL, 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('subject-student', 'demo-student', '普通同学', NULL, 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('subject-sports-lead', 'demo-sports-lead', '体育负责人', NULL, 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('subject-captain', 'demo-captain', '篮球队队长', NULL, 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3));

INSERT INTO roles
  (id, role_key, name, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('role-admin', 'platform.super_admin', '最高权限', 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('role-sports-lead', 'domain.sports_lead', '体育负责人', 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3));

INSERT INTO role_assignments
  (id, subject_uid, role_key, expires_at, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('assignment-admin', 'demo-admin', 'platform.super_admin', NULL, 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('assignment-sports-lead', 'demo-sports-lead', 'domain.sports_lead', NULL, 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3));

INSERT INTO tag_definitions
  (id, tag_key, name, description, required_scope_type, metadata, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('tag-captain', 'sports.team_captain', '体育代表队队长', '仅在绑定代表队内生效。', 'sports_team', JSON_OBJECT('resourceTypes', JSON_ARRAY('sports_team')), 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('tag-extension', 'extension.custom', '扩展权限标签', '为后续模块保留的标签接口。', NULL, JSON_OBJECT('resourceTypes', JSON_ARRAY()), 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3));

INSERT INTO tag_assignments
  (id, subject_uid, tag_key, expires_at, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('tag-captain-basketball', 'demo-captain', 'sports.team_captain', NULL, 'active', 'demo-admin', 'sports_team', 'team-basketball', NOW(3), NOW(3)),
  ('tag-captain-badminton-expired', 'demo-captain', 'sports.team_captain', '2025-01-01 00:00:00.000', 'expired', 'demo-admin', 'sports_team', 'team-badminton', NOW(3), NOW(3));

INSERT INTO modules
  (id, module_id, name, description, enabled, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('module-dashboard', 'dashboard', '工作台', '聚合发展端信息与入口。', TRUE, 'enabled', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('module-knowledge', 'knowledge', '经验库', '维护部门经验与流程。', TRUE, 'enabled', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('module-information', 'information', '信息与咨询', '发布信息并跟进咨询。', TRUE, 'enabled', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('module-clubs', 'clubs', '社群与俱乐部', '建设和管理校园社群。', TRUE, 'enabled', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('module-events', 'events', '活动', '规范活动举办与报名。', TRUE, 'enabled', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('module-liaison', 'liaison', '联络资源', '维护联络人与资源入口。', TRUE, 'enabled', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('module-sports', 'sports', '体育代表队', '管理代表队与训练签到。', TRUE, 'enabled', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('module-finance', 'finance', '财务治理', '维护预算与结算记录。', TRUE, 'enabled', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('module-admin', 'admin', '权限与模块管理', '统一管理权限、标签和模块。', TRUE, 'enabled', 'demo-admin', 'public', '*', NOW(3), NOW(3));

INSERT INTO knowledge_entries
  (id, entry_type, title, body, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('knowledge-workflow', 'workflow', '活动立项与复盘流程', '从立项、审批到复盘的标准步骤。', 'published', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('knowledge-faq', 'faq', '部门交接常见问题', '集中说明账号、资料和联系人交接。', 'published', 'demo-admin', 'public', '*', NOW(3), NOW(3));

INSERT INTO announcements
  (id, title, body, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('announcement-club', '秋季俱乐部招新开放', '欢迎同学浏览并加入感兴趣的俱乐部。', 'published', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('announcement-consultation', '权益咨询窗口更新时间', '工作日咨询将在两个工作日内完成分流。', 'published', 'demo-admin', 'public', '*', NOW(3), NOW(3));

INSERT INTO consultations
  (id, title, body, requester_uid, assignee_uid, reply, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('consultation-venue', '活动场地申请', '请问教学楼公共空间如何申请？', 'demo-student', 'demo-admin', '请填写场地预约表并等待管理员确认。', 'in_progress', 'demo-student', 'public', '*', NOW(3), NOW(3)),
  ('consultation-rights', '校园权益建议', '希望延长公共讨论空间开放时间。', 'demo-student', 'demo-admin', NULL, 'in_progress', 'demo-student', 'public', '*', NOW(3), NOW(3));

INSERT INTO clubs
  (id, name, description, technical_support_status, technical_support_note, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('club-music', '校园音乐俱乐部', '排练、分享与小型演出。', 'requested', '需要演出音响调试支持。', 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('club-running', '自由跑团', '每周轻松跑与训练交流。', 'not_requested', NULL, 'active', 'demo-sports-lead', 'public', '*', NOW(3), NOW(3));

INSERT INTO club_memberships
  (id, club_id, member_uid, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('membership-music', 'club-music', 'demo-student', 'active', 'demo-student', 'club', 'club-music', NOW(3), NOW(3)),
  ('membership-running', 'club-running', 'demo-captain', 'active', 'demo-captain', 'club', 'club-running', NOW(3), NOW(3));

INSERT INTO activities
  (id, title, description, club_id, starts_at, technical_support_status, technical_support_note, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('activity-orientation', '新生社群见面会', '一次认识各俱乐部的开放活动。', NULL, '2026-09-05 10:00:00.000', 'requested', '需要现场网络与投影支持。', 'published', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('activity-night-run', '校园夜跑', '五公里轻松跑。', 'club-running', '2026-09-12 19:00:00.000', 'confirmed', '路线签到设备已确认。', 'published', 'demo-sports-lead', 'public', '*', NOW(3), NOW(3));

INSERT INTO activity_registrations
  (id, activity_id, participant_uid, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('registration-orientation', 'activity-orientation', 'demo-student', 'registered', 'demo-student', 'activity', 'activity-orientation', NOW(3), NOW(3)),
  ('registration-night-run', 'activity-night-run', 'demo-captain', 'registered', 'demo-captain', 'activity', 'activity-night-run', NOW(3), NOW(3));

INSERT INTO sports_teams
  (id, name, description, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('team-basketball', '院篮球队', '学院篮球代表队。', 'active', 'demo-sports-lead', 'sports_team', 'team-basketball', NOW(3), NOW(3)),
  ('team-badminton', '院羽毛球队', '学院羽毛球代表队。', 'active', 'demo-sports-lead', 'sports_team', 'team-badminton', NOW(3), NOW(3));

INSERT INTO sports_team_members
  (id, team_id, member_uid, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('sports-member-basketball-captain', 'team-basketball', 'demo-captain', 'active', 'demo-sports-lead', 'sports_team', 'team-basketball', NOW(3), NOW(3)),
  ('sports-member-basketball-student', 'team-basketball', 'demo-student', 'active', 'demo-sports-lead', 'sports_team', 'team-basketball', NOW(3), NOW(3));

INSERT INTO sports_checkins
  (id, team_id, member_uid, checkin_date, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('checkin-basketball-captain', 'team-basketball', 'demo-captain', '2026-07-21', 'present', 'demo-captain', 'sports_team', 'team-basketball', NOW(3), NOW(3)),
  ('checkin-basketball-student', 'team-basketball', 'demo-student', '2026-07-21', 'present', 'demo-captain', 'sports_team', 'team-basketball', NOW(3), NOW(3));

INSERT INTO liaison_resources
  (id, name, description, category, visibility, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('liaison-tuanwei', '校团委活动联络窗口', '大型活动审批与资源协调。', 'contact', 'public', 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('liaison-venue', '公共场地预约说明', '常用场地管理部门和预约入口。', 'venue', 'organization', 'active', 'demo-admin', 'organization', 'freebbs', NOW(3), NOW(3));

INSERT INTO finance_records
  (id, title, record_kind, amount_cents, activity_id, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('finance-orientation-budget', '新生见面会预算', 'budget', 150000, 'activity-orientation', 'approved', 'demo-admin', 'activity', 'activity-orientation', NOW(3), NOW(3)),
  ('finance-night-run-settlement', '校园夜跑物资结算', 'settlement', 48600, 'activity-night-run', 'submitted', 'demo-sports-lead', 'activity', 'activity-night-run', NOW(3), NOW(3));
