import { Module } from '@nestjs/common';
import { ChallengeController } from '../contexts/identity/adapters/inbound/http/challenge.controller.js';
import { SessionController } from '../contexts/identity/adapters/inbound/http/session.controller.js';
import type { SessionWalletReader } from '../contexts/identity/adapters/inbound/http/session-wallet-reader.js';
import {
  CREATE_CHALLENGE,
  CREATE_SESSION,
  REGISTER_DEVICE,
  SESSION_WALLET_READER,
} from '../contexts/identity/adapters/inbound/http/tokens.js';
import { DevAttestationVerifier } from '../contexts/identity/adapters/outbound/dev-attestation.verifier.js';
import { DevRequestProofVerifier } from '../contexts/identity/adapters/outbound/dev-request-proof.verifier.js';
import { DevSessionProofVerifier } from '../contexts/identity/adapters/outbound/dev-session-proof.verifier.js';
import { JoseAccessTokens } from '../contexts/identity/adapters/outbound/jose-access-tokens.js';
import { MemoryChallengeStore } from '../contexts/identity/adapters/outbound/memory-challenge.store.js';
import { MemoryUserRepository } from '../contexts/identity/adapters/outbound/memory-user.repository.js';
import {
  loadSigningKey,
  type SigningKey,
} from '../contexts/identity/adapters/outbound/signing-key.js';
import type { AttestationVerifier } from '../contexts/identity/application/ports/attestation-verifier.js';
import type { ChallengeStore } from '../contexts/identity/application/ports/challenge-store.js';
import type { SessionProofVerifier } from '../contexts/identity/application/ports/session-proof-verifier.js';
import type { UserRepository } from '../contexts/identity/application/ports/user-repository.js';
import { AuthenticateRequest } from '../contexts/identity/application/use-cases/authenticate-request.js';
import { CreateChallenge } from '../contexts/identity/application/use-cases/create-challenge.js';
import { CreateSession } from '../contexts/identity/application/use-cases/create-session.js';
import { RegisterDevice } from '../contexts/identity/application/use-cases/register-device.js';
import { VerifyPlatformProof } from '../contexts/identity/application/use-cases/verify-platform-proof.js';
import type { WalletReader } from '../contexts/gamification/public/wallet-reader.js';
import { UserId } from '../shared-kernel/ids.js';
import { CryptoRandomSource } from '../shared-kernel/adapters/crypto-random-source.js';
import type { Logger } from '../shared-kernel/logger.js';
import { GamificationModule } from './gamification.module.js';
import type { InMemoryStore } from './in-memory-store.js';
import {
  ACCESS_TOKENS,
  ATTESTATION_VERIFIER,
  AUTHENTICATE_REQUEST,
  CHALLENGE_STORE,
  GET_WALLET,
  IN_MEMORY_STORE,
  LOGGER,
  PLATFORM_PROOF_VERIFIER,
  SESSION_PROOF_VERIFIER,
  SIGNING_KEY,
  USER_REPOSITORY,
} from './tokens.js';

/** Answers the auth endpoints' wallet question with Gamification's wallet reader. */
const walletReaderFor = (wallets: WalletReader): SessionWalletReader => ({
  walletOf: (userId: UserId) => wallets.execute({ userId }),
});

/**
 * Identity wiring (in-memory until S0-11). The development verifiers refuse to be built with
 * NODE_ENV=production, so the application does not start there (TC-AUTH-09); the signing key
 * comes from JWT_PRIVATE_KEY and JWT_KEY_ID, and is required in production.
 */
@Module({
  imports: [GamificationModule],
  controllers: [ChallengeController, SessionController],
  providers: [
    {
      provide: USER_REPOSITORY,
      inject: [IN_MEMORY_STORE, LOGGER],
      useFactory: (store: InMemoryStore, logger: Logger) =>
        new MemoryUserRepository({
          table: store.identity.users,
          events: store.uow,
          logger,
        }),
    },
    {
      provide: CHALLENGE_STORE,
      inject: [IN_MEMORY_STORE],
      useFactory: (store: InMemoryStore) =>
        new MemoryChallengeStore({ clock: store.clock }),
    },
    {
      provide: ATTESTATION_VERIFIER,
      useFactory: () =>
        DevAttestationVerifier.forEnvironment(process.env['NODE_ENV']),
    },
    {
      provide: SESSION_PROOF_VERIFIER,
      useFactory: () =>
        DevSessionProofVerifier.forEnvironment(process.env['NODE_ENV']),
    },
    {
      provide: SIGNING_KEY,
      inject: [LOGGER],
      useFactory: (logger: Logger) =>
        loadSigningKey(
          {
            nodeEnv: process.env['NODE_ENV'],
            privateKeyPem: process.env['JWT_PRIVATE_KEY'],
            keyId: process.env['JWT_KEY_ID'],
          },
          logger,
        ),
    },
    {
      provide: ACCESS_TOKENS,
      inject: [SIGNING_KEY, IN_MEMORY_STORE],
      useFactory: (key: SigningKey, store: InMemoryStore) =>
        new JoseAccessTokens({ key, clock: store.clock }),
    },
    {
      provide: CREATE_CHALLENGE,
      inject: [CHALLENGE_STORE, IN_MEMORY_STORE],
      useFactory: (challenges: ChallengeStore, store: InMemoryStore) =>
        new CreateChallenge({
          challenges,
          random: new CryptoRandomSource(),
          clock: store.clock,
        }),
    },
    {
      provide: REGISTER_DEVICE,
      inject: [
        CHALLENGE_STORE,
        ATTESTATION_VERIFIER,
        USER_REPOSITORY,
        ACCESS_TOKENS,
        IN_MEMORY_STORE,
      ],
      useFactory: (
        ...[challenges, attestation, users, tokens, store]: [
          ChallengeStore,
          AttestationVerifier,
          UserRepository,
          JoseAccessTokens,
          InMemoryStore,
        ]
      ) =>
        new RegisterDevice({
          challenges,
          attestation,
          users,
          tokens,
          uow: store.uow,
          ids: store.ids,
          clock: store.clock,
        }),
    },
    {
      provide: CREATE_SESSION,
      inject: [
        CHALLENGE_STORE,
        USER_REPOSITORY,
        SESSION_PROOF_VERIFIER,
        ACCESS_TOKENS,
        IN_MEMORY_STORE,
      ],
      useFactory: (
        ...[challenges, users, proofs, tokens, store]: [
          ChallengeStore,
          UserRepository,
          SessionProofVerifier,
          JoseAccessTokens,
          InMemoryStore,
        ]
      ) =>
        new CreateSession({
          challenges,
          users,
          proofs,
          tokens,
          clock: store.clock,
        }),
    },
    {
      provide: AUTHENTICATE_REQUEST,
      inject: [ACCESS_TOKENS],
      useFactory: (tokens: JoseAccessTokens) =>
        new AuthenticateRequest({ tokens }),
    },
    {
      // The development proof checker refuses NODE_ENV=production, like the other verifiers.
      provide: PLATFORM_PROOF_VERIFIER,
      inject: [USER_REPOSITORY],
      useFactory: (users: UserRepository) =>
        new VerifyPlatformProof({
          users,
          proofs: DevRequestProofVerifier.forEnvironment(
            process.env['NODE_ENV'],
          ),
        }),
    },
    {
      provide: SESSION_WALLET_READER,
      inject: [GET_WALLET],
      useFactory: walletReaderFor,
    },
  ],
  exports: [AUTHENTICATE_REQUEST, USER_REPOSITORY, PLATFORM_PROOF_VERIFIER],
})
export class IdentityModule {}
