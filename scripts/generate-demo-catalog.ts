// Generates the demo catalog snapshot (ids and QR tokens) once. Re-runnable: entries that already
// exist are kept unchanged; only definition keys without an entry get new ids and QR codes, issued
// by the domain (Branch.issueQrCode) with real randomness (FR-QR-01).
//
// npm run demo:snapshot

import { writeFileSync } from 'node:fs';
import { demoCatalogDefinition } from '../src/catalog/adapters/inbound/demo/demo-catalog.definition.js';
import { demoCatalogSnapshot } from '../src/catalog/adapters/inbound/demo/demo-catalog.snapshot.js';
import {
  completeDemoSnapshot,
  renderSnapshotModule,
} from '../src/catalog/adapters/inbound/demo/demo-snapshot.js';
import { CryptoRandomSource } from '../src/shared-kernel/adapters/crypto-random-source.js';
import { RandomIdGenerator } from '../src/shared-kernel/adapters/random-id-generator.js';
import { SystemClock } from '../src/shared-kernel/adapters/system-clock.js';

const target = new URL(
  '../src/catalog/adapters/inbound/demo/demo-catalog.snapshot.ts',
  import.meta.url,
);

const snapshot = completeDemoSnapshot(
  demoCatalogDefinition,
  demoCatalogSnapshot,
  {
    random: new CryptoRandomSource(),
    ids: new RandomIdGenerator(),
    clock: new SystemClock(),
  },
);

const added =
  Object.keys(snapshot.branches).length -
  Object.keys(demoCatalogSnapshot.branches).length;
writeFileSync(target, renderSnapshotModule(snapshot));
console.log(
  `Demo snapshot written: ${Object.keys(snapshot.branches).length} branches (${added} new).`,
);
