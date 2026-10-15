// Injection tokens. Wiring uses factory providers with explicit tokens (docs/07 §2), so it does not
// depend on decorator metadata.

export const EVENT_ROUTER = Symbol('EventRouter');
export const CLOCK = Symbol('Clock');
export const IN_MEMORY_STORE = Symbol('InMemoryStore');
export const LOGGER = Symbol('Logger');
export const EVENT_ROUTES = Symbol('EventRoutes');
export const EVENT_ROUTES_CHECK = Symbol('EventRoutesCheck');

export const CATALOG_REPOSITORIES = Symbol('CatalogRepositories');
export const QR_RESOLVER = Symbol('QrResolver');
export const LABEL_SET_PROVIDER = Symbol('LabelSetProvider');
export const REVOKE_QR_CODE = Symbol('RevokeQrCode');
export const DEMO_CATALOG = Symbol('DemoCatalog');
export const BRANCH_DIRECTORY = Symbol('BranchDirectory');

export const WALLET_REPOSITORY = Symbol('WalletRepository');
export const OPEN_WALLET = Symbol('OpenWallet');
export const AWARD_REWARD = Symbol('AwardReward');
export const GET_WALLET = Symbol('GetWallet');
export const REWARD_LOOKUP = Symbol('RewardLookup');

export const USER_REPOSITORY = Symbol('UserRepository');
export const CHALLENGE_STORE = Symbol('ChallengeStore');
export const ATTESTATION_VERIFIER = Symbol('AttestationVerifier');
export const SESSION_PROOF_VERIFIER = Symbol('SessionProofVerifier');
export const SIGNING_KEY = Symbol('SigningKey');
export const ACCESS_TOKENS = Symbol('AccessTokens');
export const AUTHENTICATE_REQUEST = Symbol('AuthenticateRequest');
export const PLATFORM_PROOF_VERIFIER = Symbol('PlatformProofVerifier');

export const FEEDBACK_REPOSITORY = Symbol('FeedbackRepository');
export const REWARD_COOLDOWN_REPOSITORY = Symbol('RewardCooldownRepository');
export const RAW_TEXT_CIPHER = Symbol('RawTextCipher');
export const APPLY_ANALYSIS_RESULT = Symbol('ApplyAnalysisResult');
export const RAW_TEXT_SOURCE = Symbol('RawTextSource');

export const FEEDBACK_ANALYSIS_REPOSITORY = Symbol(
  'FeedbackAnalysisRepository',
);
export const SENTIMENT_ANALYZER = Symbol('SentimentAnalyzer');
export const PROCESS_ANALYSIS_JOB = Symbol('ProcessAnalysisJob');
export const UNANALYZED_REPORT = Symbol('UnanalyzedReport');

export const B2B_CLIENT_REPOSITORY = Symbol('B2bClientRepository');
export const SECRET_HASHER = Symbol('SecretHasher');
export const B2B_ACCESS_TOKENS = Symbol('B2bAccessTokens');
export const REPORTING_QUERIES = Symbol('ReportingQueries');
export const DEMO_B2B_CLIENTS = Symbol('DemoB2bClients');
