import type { ModuleManifest } from '@freebbs-development/contracts';
import { Navigate, RouterProvider, createBrowserRouter, useLoaderData } from 'react-router-dom';

import { createApiClient } from '../core/api/client.js';
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
  const moduleStates = useLoaderData() as ModuleStateOverrides | undefined;
  return <AppShell moduleStates={moduleStates} />;
}

function ModulePlaceholder({ description, name }: { description: string; name: string }) {
  return (
    <section aria-labelledby="module-placeholder-title">
      <h2 id="module-placeholder-title">{name}</h2>
      <p>{description}</p>
    </section>
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
        ...MODULE_MANIFESTS.map((module) => ({
          path: module.route.slice(1),
          element: <ModulePlaceholder name={module.name} description={module.description} />,
        })),
        { path: '*', element: <Navigate to="/dashboard" replace /> },
      ],
    },
  ],
  { basename: '/development' },
);

export function AppRouter() {
  return <RouterProvider router={appRouter} />;
}
