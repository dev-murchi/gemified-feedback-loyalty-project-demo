// Injection tokens. Wiring uses factory providers with explicit tokens (docs/07 §2), so it does not
// depend on decorator metadata.

export const IN_MEMORY_STORE = Symbol('InMemoryStore');

export const CATALOG_REPOSITORIES = Symbol('CatalogRepositories');
export const QR_RESOLVER = Symbol('QrResolver');
export const LABEL_SET_PROVIDER = Symbol('LabelSetProvider');
export const REVOKE_QR_CODE = Symbol('RevokeQrCode');
export const DEMO_CATALOG = Symbol('DemoCatalog');
