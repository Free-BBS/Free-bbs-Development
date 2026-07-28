import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { URL } from 'node:url';

const root = new URL('../../', import.meta.url);

async function workflow(name) {
  return readFile(new URL(`.github/workflows/${name}.yml`, root), 'utf8');
}

test('CI validates pull requests without deploying and preserves Playwright evidence', async () => {
  const source = await workflow('ci');

  assert.match(source, /pull_request:/);
  assert.match(source, /push:\s*\n\s*branches:\s*\[main\]/);
  assert.doesNotMatch(source, /environment:\s*production/);
  assert.doesNotMatch(source, /\bdeploy(?:ment)?\b/i);
  assert.match(source, /actions\/checkout@v5/);
  assert.match(source, /actions\/setup-node@v6/);
  assert.match(source, /npm run check/);
  assert.match(source, /npx playwright install --with-deps chromium/);
  assert.match(source, /npx playwright test/);
  assert.match(source, /actions\/upload-artifact@v5/);
  assert.match(source, /playwright-report/);
});

test('production deployment only runs for a protected main push through its environment', async () => {
  const source = await workflow('deploy');

  assert.match(source, /push:\s*\n\s*branches:\s*\[main\]/);
  assert.doesNotMatch(source, /pull_request:/);
  assert.match(source, /github\.ref == 'refs\/heads\/main'/);
  assert.match(source, /github\.ref_protected == true/);
  assert.match(source, /environment:\s*\n\s*name:\s*production/);
  assert.match(source, /secrets\.DEPLOY_HOST/);
  assert.match(source, /secrets\.DEPLOY_USER/);
  assert.match(source, /secrets\.DEPLOY_SSH_KEY/);
  assert.match(source, /secrets\.DEPLOY_KNOWN_HOSTS/);
  assert.ok(source.indexOf('secrets.DEPLOY_HOST') > source.indexOf('npm run build'));
  const installStep = source.slice(
    source.indexOf('- name: Install SSH credentials'),
    source.indexOf('- name: Publish verified release'),
  );
  assert.doesNotMatch(installStep, /DEPLOY_HOST|DEPLOY_USER/);
  const publishStep = source.slice(source.indexOf('- name: Publish verified release'));
  assert.match(publishStep, /for required in DEPLOY_HOST DEPLOY_USER/);
  assert.match(source, /npm run check/);
  assert.match(source, /npx playwright test/);
  assert.match(source, /deploy-freebbs-development/);
  assert.match(source, /scripts\/create-release-archive\.sh/);
  assert.match(source, /--sha "\$\{GITHUB_SHA\}"/);
  assert.ok(
    source.indexOf('scripts/create-release-archive.sh') < source.indexOf('secrets.DEPLOY_SSH_KEY'),
  );
  const guide = await readFile(new URL('docs/server-deployment.md', root), 'utf8');
  assert.ok(guide.includes('/usr/local/sbin/deploy-freebbs-development'));
});

test('database migration requires exact RUN confirmation and a protected environment', async () => {
  const source = await workflow('db-migrate');

  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /confirmation:/);
  assert.match(source, /required:\s*true/);
  assert.match(source, /inputs\.confirmation == 'RUN'/);
  assert.match(source, /github\.ref == 'refs\/heads\/main'/);
  assert.match(source, /github\.ref_protected == true/);
  assert.match(source, /environment:\s*\n\s*name:\s*production-database/);
  assert.match(source, /runs-on:\s*\[self-hosted, linux, production-database\]/);
  assert.match(source, /DATA_MODE:\s*mysql/);
  assert.match(source, /secrets\.MYSQL_HOST/);
  assert.match(source, /secrets\.MYSQL_MIGRATION_USER/);
  assert.match(source, /secrets\.MYSQL_MIGRATION_PASSWORD/);
  assert.ok(source.indexOf('secrets.MYSQL_HOST') > source.indexOf('npm run build'));
  assert.match(source, /npm run db:migrate/);
  assert.doesNotMatch(source, /npm run db:seed/);
});
