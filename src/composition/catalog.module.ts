import { Module } from '@nestjs/common';
import { loadDemoCatalog } from '../contexts/catalog/adapters/inbound/demo/demo-catalog-loader.js';
import { MemoryBrandRepository } from '../contexts/catalog/adapters/outbound/memory-brand.repository.js';
import { MemoryBranchRepository } from '../contexts/catalog/adapters/outbound/memory-branch.repository.js';
import { MemoryLabelSetRepository } from '../contexts/catalog/adapters/outbound/memory-label-set.repository.js';
import { ProvideLabelSet } from '../contexts/catalog/application/use-cases/provide-label-set.js';
import { ResolveQr } from '../contexts/catalog/application/use-cases/resolve-qr.js';
import { RevokeQrCode } from '../contexts/catalog/application/use-cases/revoke-qr-code.js';
import { isDemoDataEnabled } from './demo-data.js';
import type { InMemoryStore } from './in-memory-store.js';
import {
  CATALOG_REPOSITORIES,
  DEMO_CATALOG,
  IN_MEMORY_STORE,
  LABEL_SET_PROVIDER,
  QR_RESOLVER,
  REVOKE_QR_CODE,
} from './tokens.js';

interface CatalogRepositories {
  readonly brands: MemoryBrandRepository;
  readonly branches: MemoryBranchRepository;
  readonly labelSets: MemoryLabelSetRepository;
}

const catalogRepositories = (store: InMemoryStore): CatalogRepositories => ({
  brands: new MemoryBrandRepository({
    table: store.catalog.brands,
    events: store.uow,
  }),
  branches: new MemoryBranchRepository({
    table: store.catalog.branches,
    events: store.uow,
  }),
  labelSets: new MemoryLabelSetRepository({
    table: store.catalog.labelSets,
    events: store.uow,
  }),
});

/** Loads the demo catalog only when DEMO_DATA=true; refuses with NODE_ENV=production. */
async function demoCatalog(
  repositories: CatalogRepositories,
  store: InMemoryStore,
) {
  if (!isDemoDataEnabled(process.env)) return { loaded: false };
  await loadDemoCatalog({ ...repositories, uow: store.uow });
  return { loaded: true };
}

/** Catalog wiring (in-memory until S0-11). Exposes only the open host services and admin use case. */
@Module({
  providers: [
    {
      provide: CATALOG_REPOSITORIES,
      inject: [IN_MEMORY_STORE],
      useFactory: catalogRepositories,
    },
    {
      provide: QR_RESOLVER,
      inject: [CATALOG_REPOSITORIES],
      useFactory: (repositories: CatalogRepositories) =>
        new ResolveQr(repositories),
    },
    {
      provide: LABEL_SET_PROVIDER,
      inject: [CATALOG_REPOSITORIES],
      useFactory: (repositories: CatalogRepositories) =>
        new ProvideLabelSet(repositories),
    },
    {
      provide: REVOKE_QR_CODE,
      inject: [CATALOG_REPOSITORIES, IN_MEMORY_STORE],
      useFactory: (repositories: CatalogRepositories, store: InMemoryStore) =>
        new RevokeQrCode({
          branches: repositories.branches,
          uow: store.uow,
          clock: store.clock,
        }),
    },
    {
      provide: DEMO_CATALOG,
      inject: [CATALOG_REPOSITORIES, IN_MEMORY_STORE],
      useFactory: demoCatalog,
    },
  ],
  exports: [QR_RESOLVER, LABEL_SET_PROVIDER, REVOKE_QR_CODE],
})
export class CatalogModule {}
