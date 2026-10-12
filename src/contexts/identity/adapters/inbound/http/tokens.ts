// Injection tokens for what the composition root provides to the auth controller.

export const CREATE_CHALLENGE = Symbol('CreateChallenge');
export const REGISTER_DEVICE = Symbol('RegisterDevice');
export const CREATE_SESSION = Symbol('CreateSession');
export const SESSION_WALLET_READER = Symbol('SessionWalletReader');
