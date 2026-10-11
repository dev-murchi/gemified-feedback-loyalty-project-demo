// Injection tokens. Wiring uses factory providers with explicit tokens (docs/07 §2), so it does not
// depend on decorator metadata.

export const EVENT_ROUTER = Symbol('EventRouter');
export const IN_MEMORY_STORE = Symbol('InMemoryStore');
export const LOGGER = Symbol('Logger');
export const EVENT_ROUTES = Symbol('EventRoutes');
export const EVENT_ROUTES_CHECK = Symbol('EventRoutesCheck');

export const CATALOG_REPOSITORIES = Symbol('CatalogRepositories');
export const QR_RESOLVER = Symbol('QrResolver');
export const LABEL_SET_PROVIDER = Symbol('LabelSetProvider');
export const REVOKE_QR_CODE = Symbol('RevokeQrCode');
export const DEMO_CATALOG = Symbol('DemoCatalog');

export const WALLET_REPOSITORY = Symbol('WalletRepository');
export const OPEN_WALLET = Symbol('OpenWallet');
export const AWARD_REWARD = Symbol('AwardReward');
export const GET_WALLET = Symbol('GetWallet');
export const REWARD_LOOKUP = Symbol('RewardLookup');
