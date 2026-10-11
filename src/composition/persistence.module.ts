import { Global, Module } from '@nestjs/common';
import { createInMemoryStore } from './in-memory-store.js';
import { IN_MEMORY_STORE } from './tokens.js';

/** Provides the shared in-memory store and unit of work to every context module. */
@Global()
@Module({
  providers: [
    { provide: IN_MEMORY_STORE, useFactory: () => createInMemoryStore() },
  ],
  exports: [IN_MEMORY_STORE],
})
export class PersistenceModule {}
