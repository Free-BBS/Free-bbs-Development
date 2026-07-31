INSERT INTO subjects
  (id, uid, display_name, avatar_url, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('subject-admin', 'demo-admin', '发展端管理员', NULL, 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('subject-student', 'demo-student', '普通同学', NULL, 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('subject-rights-member', 'demo-rights-member', '权益发展中心部员', NULL, 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('subject-liaison-member', 'demo-liaison-member', '联络中心部员', NULL, 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('subject-sports-lead', 'demo-sports-lead', '体育负责人', NULL, 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('subject-sports-director', 'demo-sports-director', '体育中心部长', NULL, 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('subject-captain', 'demo-captain', '篮球队队长', NULL, 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('subject-tuanwei-lead', 'demo-tuanwei-lead', '团委负责人', NULL, 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3));

INSERT INTO roles
  (id, role_key, name, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('role-admin', 'platform.super_admin', '最高权限', 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('role-rights-member', 'department.rights_development_member', '权益发展中心部员', 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('role-liaison-member', 'department.liaison_member', '联络中心部员', 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('role-sports-lead', 'domain.sports_lead', '体育负责人', 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('role-sports-director', 'department.sports_director', '体育中心部长', 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('role-tuanwei-lead', 'affiliation.tuanwei_lead', '团委负责人', 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3));

INSERT INTO role_assignments
  (id, subject_uid, role_key, expires_at, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('assignment-rights-member', 'demo-rights-member', 'department.rights_development_member', NULL, 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('assignment-liaison-member', 'demo-liaison-member', 'department.liaison_member', NULL, 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('assignment-sports-lead', 'demo-sports-lead', 'domain.sports_lead', NULL, 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('assignment-sports-director', 'demo-sports-director', 'department.sports_director', NULL, 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('assignment-tuanwei-lead', 'demo-tuanwei-lead', 'affiliation.tuanwei_lead', NULL, 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3));

INSERT INTO tag_definitions
  (id, tag_key, name, description, required_scope_type, metadata, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('tag-captain', 'sports.team_captain', '体育代表队队长', '仅在绑定代表队内生效。', 'sports_team', JSON_OBJECT('resourceTypes', JSON_ARRAY('sports_team')), 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('tag-rights-center', 'social_org.rights_development_center', '权益发展中心', '权益发展中心组织身份。', 'social_organization', JSON_OBJECT('resourceTypes', JSON_ARRAY()), 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('tag-liaison-center', 'social_org.liaison_center', '联络中心', '联络中心组织身份。', 'social_organization', JSON_OBJECT('resourceTypes', JSON_ARRAY()), 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('tag-sports-center', 'social_org.sports_center', '体育中心', '体育中心组织身份。', 'social_organization', JSON_OBJECT('resourceTypes', JSON_ARRAY()), 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('tag-tuanwei', 'social_org.tuanwei', '团委', '团委组织身份。', 'social_organization', JSON_OBJECT('resourceTypes', JSON_ARRAY()), 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('tag-extension', 'extension.custom', '扩展权限标签', '为后续模块保留的标签接口。', NULL, JSON_OBJECT('resourceTypes', JSON_ARRAY()), 'active', 'demo-admin', 'public', '*', NOW(3), NOW(3));

INSERT INTO tag_assignments
  (id, subject_uid, tag_key, expires_at, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('tag-captain-basketball', 'demo-captain', 'sports.team_captain', NULL, 'active', 'demo-admin', 'sports_team', 'team-basketball', NOW(3), NOW(3)),
  ('tag-rights-organization', 'demo-rights-member', 'social_org.rights_development_center', NULL, 'active', 'demo-admin', 'social_organization', 'rights_development_center', NOW(3), NOW(3)),
  ('tag-liaison-organization', 'demo-liaison-member', 'social_org.liaison_center', NULL, 'active', 'demo-admin', 'social_organization', 'liaison_center', NOW(3), NOW(3)),
  ('tag-sports-lead-organization', 'demo-sports-lead', 'social_org.sports_center', NULL, 'active', 'demo-admin', 'social_organization', 'sports_center', NOW(3), NOW(3)),
  ('tag-sports-director-organization', 'demo-sports-director', 'social_org.sports_center', NULL, 'active', 'demo-admin', 'social_organization', 'sports_center', NOW(3), NOW(3)),
  ('tag-tuanwei-organization', 'demo-tuanwei-lead', 'social_org.tuanwei', NULL, 'active', 'demo-admin', 'social_organization', 'tuanwei', NOW(3), NOW(3));

INSERT INTO modules
  (id, module_id, name, description, enabled, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('module-dashboard', 'dashboard', '工作台', '聚合发展端信息与入口。', TRUE, 'enabled', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('module-knowledge', 'knowledge', '经验库', '维护部门经验与流程。', TRUE, 'enabled', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('module-information', 'information', '信息与咨询', '发布信息并跟进咨询。', TRUE, 'enabled', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('module-clubs', 'clubs', '趣缘群体', '建设和管理校园趣缘群体。', TRUE, 'enabled', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('module-events', 'events', '活动', '规范活动举办与报名。', TRUE, 'enabled', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('module-liaison', 'liaison', '联络资源', '维护联络人与资源入口。', TRUE, 'enabled', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('module-sports', 'sports', '体育代表队', '管理代表队与训练签到。', TRUE, 'enabled', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('module-finance', 'finance', '财务治理', '维护预算与结算记录。', TRUE, 'enabled', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('module-admin', 'admin', '权限与模块管理', '统一管理权限、标签和模块。', TRUE, 'enabled', 'demo-admin', 'public', '*', NOW(3), NOW(3));

INSERT INTO knowledge_entries
  (id, entry_type, title, body, audience, organization_id, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('knowledge-workflow', 'workflow', '活动立项与复盘流程', '从立项、审批到复盘的标准步骤。', 'general', NULL, 'published', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('knowledge-faq', 'faq', '部门交接常见问题', '集中说明账号、资料和联系人交接。', 'general', NULL, 'published', 'demo-admin', 'public', '*', NOW(3), NOW(3)),
  ('knowledge-sports-handover', 'workflow', '体育中心代表队交接清单', '整理代表队联系人、训练安排、报名节点、常见问题与年度复盘。', 'social_org', 'sports_center', 'published', 'demo-sports-lead', 'social_organization', 'sports_center', NOW(3), NOW(3));

INSERT INTO announcements
  (id, title, body, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('announcement-club', '秋季趣缘群体招新开放', '欢迎同学浏览并加入感兴趣的趣缘群体。', 'published', 'demo-liaison-member', 'public', '*', NOW(3), NOW(3)),
  ('announcement-consultation', '权益咨询窗口更新时间', '工作日咨询将在两个工作日内完成分流。', 'published', 'demo-rights-member', 'public', '*', NOW(3), NOW(3));

INSERT INTO consultations
  (id, title, body, requester_uid, assignee_uid, reply, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('consultation-venue', '活动场地申请', '请问教学楼公共空间如何申请？', 'demo-student', 'demo-rights-member', '请填写场地预约表并等待管理员确认。', 'in_progress', 'demo-student', 'public', '*', NOW(3), NOW(3)),
  ('consultation-rights', '校园权益建议', '希望延长公共讨论空间开放时间。', 'demo-student', 'demo-rights-member', NULL, 'in_progress', 'demo-student', 'public', '*', NOW(3), NOW(3));

INSERT INTO proposals
  (id, title, problem_description, proposed_solution, category, submitter_uid, assignee_uid, public_progress, internal_note, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('proposal-night-lighting', '校园夜间照明优化', '部分公共活动区域夜间照明不足，影响同学通行与活动。', '梳理重点点位并与相关部门共同推进照明巡检和补充。', '校园空间', 'demo-student', 'demo-rights-member', '已收集首批点位，正在核实现场情况。', '下一步联系物业与相关场馆负责人。', 'reviewing', 'demo-student', 'public', '*', NOW(3), NOW(3));

INSERT INTO clubs
  (id, name, description, organization_id, technical_support_status, technical_support_note, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('club-music', '校园音乐俱乐部', '排练、分享与小型演出。', 'liaison_center', 'requested', '需要演出音响调试支持。', 'active', 'demo-liaison-member', 'public', '*', NOW(3), NOW(3)),
  ('club-running', '自由跑团', '每周轻松跑与训练交流。', 'liaison_center', 'not_requested', NULL, 'active', 'demo-liaison-member', 'public', '*', NOW(3), NOW(3));

INSERT INTO club_memberships
  (id, club_id, member_uid, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('membership-music', 'club-music', 'demo-student', 'active', 'demo-student', 'club', 'club-music', NOW(3), NOW(3)),
  ('membership-running', 'club-running', 'demo-captain', 'active', 'demo-captain', 'club', 'club-running', NOW(3), NOW(3));

INSERT INTO activities
  (id, title, description, club_id, starts_at, ends_at, location, organization_id, standing_activity, technical_support_status, technical_support_note, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('activity-orientation', '新生趣缘群体见面会', '一次认识各趣缘群体的开放活动。', NULL, '2026-09-05 10:00:00.000', '2026-09-05 12:00:00.000', '中央主楼大厅', 'liaison_center', FALSE, 'requested', '需要现场网络与投影支持。', 'published', 'demo-liaison-member', 'public', '*', NOW(3), NOW(3)),
  ('activity-night-run', '校园夜跑', '五公里轻松跑。', 'club-running', '2026-09-12 19:00:00.000', '2026-09-12 21:00:00.000', '东大操场', 'sports_center', FALSE, 'confirmed', '路线签到设备已确认。', 'published', 'demo-sports-lead', 'public', '*', NOW(3), NOW(3)),
  ('activity-ma-john-cup', '马约翰杯', '学院代表队参加的常设综合体育赛事，集中展示赛程与比赛进展。', NULL, '2026-10-10 08:00:00.000', '2026-11-15 10:00:00.000', '清华大学各体育场馆', 'sports_center', TRUE, 'not_requested', NULL, 'published', 'demo-sports-lead', 'public', '*', NOW(3), NOW(3));

INSERT INTO activity_milestones
  (id, activity_id, occurs_at, title, milestone_type, description, completed, display_order, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('milestone-ma-host', 'activity-ma-john-cup', '2026-09-01 10:00:00.000', '主持人推送', 'promotion', '发布主持人和赛事志愿者招募信息。', TRUE, 1, 'active', 'demo-sports-lead', 'activity', 'activity-ma-john-cup', NOW(3), NOW(3)),
  ('milestone-ma-registration', 'activity-ma-john-cup', '2026-09-10 10:00:00.000', '队员招募推送', 'registration', '各代表队开放报名与选拔。', TRUE, 2, 'active', 'demo-sports-lead', 'activity', 'activity-ma-john-cup', NOW(3), NOW(3)),
  ('milestone-ma-preliminary', 'activity-ma-john-cup', '2026-10-10 08:00:00.000', '初赛', 'competition', '各项目初赛与小组赛开始。', FALSE, 3, 'active', 'demo-sports-lead', 'activity', 'activity-ma-john-cup', NOW(3), NOW(3)),
  ('milestone-ma-final', 'activity-ma-john-cup', '2026-11-15 08:00:00.000', '决赛', 'competition', '决赛日与闭幕总结。', FALSE, 4, 'active', 'demo-sports-lead', 'activity', 'activity-ma-john-cup', NOW(3), NOW(3));

INSERT INTO competition_fixtures
  (id, activity_id, round_name, participant_a, participant_b, scheduled_at, location, score, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('fixture-ma-group-1', 'activity-ma-john-cup', '小组赛', '电子系', '自动化系', '2026-10-10 11:00:00.000', '东大操场', NULL, 'scheduled', 'demo-sports-lead', 'activity', 'activity-ma-john-cup', NOW(3), NOW(3));

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
  ('liaison-tuanwei', '校团委活动联络窗口', '大型活动审批与资源协调。', 'contact', 'public', 'active', 'demo-liaison-member', 'public', '*', NOW(3), NOW(3)),
  ('liaison-venue', '公共场地预约说明', '常用场地管理部门和预约入口。', 'venue', 'organization', 'active', 'demo-liaison-member', 'organization', 'freebbs', NOW(3), NOW(3));

INSERT INTO finance_records
  (id, title, record_kind, amount_cents, activity_id, organization_id, reviewer_uid, reviewed_at, review_decision, status, owner_uid, scope_type, scope_id, created_at, updated_at)
VALUES
  ('finance-orientation-budget', '新生见面会预算', 'budget', 150000, 'activity-orientation', 'liaison_center', 'demo-tuanwei-lead', '2026-07-22 08:00:00.000', 'approved', 'approved', 'demo-liaison-member', 'activity', 'activity-orientation', NOW(3), NOW(3)),
  ('finance-night-run-settlement', '校园夜跑物资结算', 'settlement', 48600, 'activity-night-run', 'sports_center', NULL, NULL, NULL, 'submitted', 'demo-sports-lead', 'activity', 'activity-night-run', NOW(3), NOW(3));
