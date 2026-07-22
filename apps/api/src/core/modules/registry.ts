import type { ModuleManifest } from '@freebbs-development/contracts';
import type { DevelopmentStore } from '../database/types.js';
import { MODULE_MANIFESTS } from './manifests.js';

export async function listModuleManifests(store: DevelopmentStore): Promise<ModuleManifest[]> {
  const records = await store.modules.list();
  const configured = new Map(records.map((record) => [record.moduleId, record]));

  return MODULE_MANIFESTS.map((manifest) => {
    const record = configured.get(manifest.id);
    return {
      ...manifest,
      name: record?.name ?? manifest.name,
      description: record?.description ?? manifest.description,
      status: record === undefined ? manifest.status : record.enabled ? 'enabled' : 'disabled',
    };
  }).sort((left, right) => left.order - right.order);
}
