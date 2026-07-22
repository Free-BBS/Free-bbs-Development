import type { ModuleManifest } from '@freebbs-development/contracts';
import { Navigate, RouterProvider, createBrowserRouter, useLoaderData } from 'react-router-dom';

import { createApiClient } from '../core/api/client.js';
import { AdminPage } from '../modules/admin/AdminPage.js';
import { ClubsPage } from '../modules/clubs/ClubsPage.js';
import { DashboardPage } from '../modules/dashboard/DashboardPage.js';
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

export const appRouter = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppShellRoute />,
      loader: loadModuleStates,
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },
        { path: 'dashboard', element: <DashboardPage /> },
        { path: 'knowledge', element: <KnowledgePage /> },
        { path: 'information', element: <InformationPage /> },
        { path: 'clubs', element: <ClubsPage /> },
        { path: 'events', element: <EventsPage /> },
        { path: 'liaison', element: <LiaisonPage /> },
        { path: 'sports', element: <SportsPage /> },
        { path: 'finance', element: <FinancePage /> },
        { path: 'admin', element: <AdminPage /> },
        { path: '*', element: <Navigate to="/dashboard" replace /> },
      ],
    },
  ],
  { basename: '/development' },
);

export function AppRouter() {
  return <RouterProvider router={appRouter} />;
}
