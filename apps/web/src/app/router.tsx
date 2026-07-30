import type { ModuleManifest } from '@freebbs-development/contracts';
import { Navigate, RouterProvider, createBrowserRouter, useLoaderData } from 'react-router-dom';
import { useParams } from 'react-router-dom';

import { createApiClient } from '../core/api/client.js';
import { useAuth } from '../core/auth/AuthProvider.js';
import type { PresentationUser } from '../core/permissions/Can.js';
import { SuperAdminRouteGuard } from '../core/permissions/SuperAdminRouteGuard.js';
import { AdminPage } from '../modules/admin/AdminPage.js';
import { ClubsPage } from '../modules/clubs/ClubsPage.js';
import { DashboardPage } from '../modules/dashboard/DashboardPage.js';
import { ActivityDetailPage } from '../modules/events/ActivityDetailPage.js';
import { EventsPage } from '../modules/events/EventsPage.js';
import { FinancePage } from '../modules/finance/FinancePage.js';
import { InformationPage } from '../modules/information/InformationPage.js';
import { KnowledgePage } from '../modules/knowledge/KnowledgePage.js';
import { LiaisonPage } from '../modules/liaison/LiaisonPage.js';
import { SportsPage } from '../modules/sports/SportsPage.js';
import { AppShell } from './AppShell.js';
import { MODULE_MANIFESTS, type ModuleStateOverrides } from './module-manifests.js';

export async function loadModuleStates(): Promise<ModuleStateOverrides> {
  try {
    const modules = await createApiClient().request<ModuleManifest[]>('/modules');
    const knownIds = new Set(MODULE_MANIFESTS.map((module) => module.id));
    return Object.fromEntries(
      modules
        .filter((module) => knownIds.has(module.id))
        .map((module) => [module.id, module.status]),
    ) as ModuleStateOverrides;
  } catch {
    return Object.fromEntries(
      MODULE_MANIFESTS.map((module) => [module.id, 'disabled']),
    ) as ModuleStateOverrides;
  }
}

function AppShellRoute() {
  const moduleStates = useLoaderData() as ModuleStateOverrides;
  return <AppShell moduleStates={moduleStates} />;
}

function DashboardRoute() {
  const auth = useAuth();
  return (
    <DashboardPage
      key={auth.demoUser ?? auth.user?.uid}
      client={auth.client}
      user={auth.user as PresentationUser}
    />
  );
}

function KnowledgeRoute() {
  const auth = useAuth();
  return <KnowledgePage key={auth.demoUser ?? auth.user?.uid} client={auth.client} />;
}

function InformationRoute() {
  const auth = useAuth();
  return (
    <InformationPage key={auth.demoUser ?? auth.user?.uid} client={auth.client} user={auth.user} />
  );
}

function ClubsRoute() {
  const auth = useAuth();
  return <ClubsPage key={auth.demoUser ?? auth.user?.uid} client={auth.client} />;
}

function EventsRoute() {
  const auth = useAuth();
  return <EventsPage key={auth.demoUser ?? auth.user?.uid} client={auth.client} />;
}

function ActivityDetailRoute() {
  const auth = useAuth();
  const { activityId = '' } = useParams();
  return (
    <ActivityDetailPage
      key={`${auth.demoUser ?? auth.user?.uid}:${activityId}`}
      activityId={activityId}
      client={auth.client}
    />
  );
}

function LiaisonRoute() {
  const auth = useAuth();
  return <LiaisonPage key={auth.demoUser ?? auth.user?.uid} client={auth.client} />;
}

function SportsRoute() {
  const auth = useAuth();
  return <SportsPage key={auth.demoUser ?? auth.user?.uid} client={auth.client} />;
}

function FinanceRoute() {
  const auth = useAuth();
  return <FinancePage key={auth.demoUser ?? auth.user?.uid} client={auth.client} />;
}

function AdminRoute() {
  const auth = useAuth();
  return (
    <SuperAdminRouteGuard user={auth.user as PresentationUser | null}>
      <AdminPage key={auth.demoUser ?? auth.user?.uid} client={auth.client} />
    </SuperAdminRouteGuard>
  );
}

export const appRouter = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppShellRoute />,
      loader: loadModuleStates,
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },
        { path: 'dashboard', element: <DashboardRoute /> },
        { path: 'knowledge', element: <KnowledgeRoute /> },
        { path: 'information', element: <InformationRoute /> },
        { path: 'interest-groups', element: <ClubsRoute /> },
        { path: 'clubs', element: <Navigate to="/interest-groups" replace /> },
        { path: 'events', element: <EventsRoute /> },
        { path: 'liaison', element: <LiaisonRoute /> },
        { path: 'events/:activityId', element: <ActivityDetailRoute /> },
        { path: 'sports', element: <SportsRoute /> },
        { path: 'finance', element: <FinanceRoute /> },
        { path: 'admin', element: <AdminRoute /> },
        { path: '*', element: <Navigate to="/dashboard" replace /> },
      ],
    },
  ],
  { basename: '/development' },
);

export function AppRouter() {
  return <RouterProvider router={appRouter} />;
}
