import { act, render, waitFor } from '@testing-library/react';
import { RouterProvider, matchRoutes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { UserContext } from '@freebbs-development/contracts';

import { appRouter } from './router.js';

const { mockRequest, mockUseAuth } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock('../core/api/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/api/client.js')>()),
  createApiClient: () => ({ request: mockRequest }),
}));

vi.mock('../core/auth/AuthProvider.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../core/auth/AuthProvider.js')>()),
  useAuth: mockUseAuth,
}));

const student: UserContext = {
  uid: 'student-1',
  displayName: '林同学',
  avatarUrl: null,
  baseRole: 'student',
  roles: [],
  tags: [],
};

function leafRoute(pathname: string) {
  const matches = matchRoutes(appRouter.routes, pathname);
  return matches?.at(-1)?.route;
}

function redirectTarget(pathname: string) {
  return (
    (leafRoute(pathname) as unknown as { element?: { props?: { to?: string } } }).element?.props
      ?.to
  );
}

describe('application routes', () => {
  it('redirects the information module entry point to announcements', () => {
    const route = leafRoute('/information');

    expect(route?.path).toBe('information');
    expect(redirectTarget('/information')).toBe('/information/announcements');
  });

  it.each([
    ['/information/announcements', 'information/announcements'],
    ['/information/consultations', 'information/consultations'],
    ['/information/triage', 'information/triage'],
    ['/information/proposals', 'information/proposals'],
    ['/information/proposals/proposal-1', 'information/proposals/:proposalId'],
    ['/events/activity-1', 'events/:activityId'],
    ['/sports/team-1', 'sports/:teamId'],
    ['/liaison/problems/problem-1', 'liaison/problems/:problemId'],
  ])('matches %s to its focused module route', (pathname, expectedPath) => {
    expect(leafRoute(pathname)?.path).toBe(expectedPath);
  });

  it('keeps the clubs legacy URL redirect', () => {
    const route = leafRoute('/clubs');

    expect(route?.path).toBe('clubs');
    expect(redirectTarget('/clubs')).toBe('/interest-groups');
  });

  it('keeps unknown paths on the dashboard fallback', () => {
    const route = leafRoute('/not-a-module');

    expect(route?.path).toBe('*');
    expect(redirectTarget('/not-a-module')).toBe('/dashboard');
  });

  it('redirects an unauthorized administrator to the dashboard', async () => {
    mockRequest.mockResolvedValue([]);
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      user: student,
      error: null,
      reload: vi.fn(),
      authMode: 'main',
      demoUser: null,
      setDemoUser: vi.fn(),
      loginUrl: '/login',
      client: { request: mockRequest },
    });

    await act(async () => {
      await appRouter.navigate('/admin');
    });
    render(<RouterProvider router={appRouter} />);

    await waitFor(() => expect(appRouter.state.location.pathname).toBe('/development/dashboard'));
  });
});
