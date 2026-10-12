import { DevAttestationVerifier } from '../../src/contexts/identity/adapters/outbound/dev-attestation.verifier.js';
import { DevSessionProofVerifier } from '../../src/contexts/identity/adapters/outbound/dev-session-proof.verifier.js';
import { MemoryChallengeStore } from '../../src/contexts/identity/adapters/outbound/memory-challenge.store.js';
import type { UserRepository } from '../../src/contexts/identity/application/ports/user-repository.js';
import { CreateChallenge } from '../../src/contexts/identity/application/use-cases/create-challenge.js';
import { AuthenticateRequest } from '../../src/contexts/identity/application/use-cases/authenticate-request.js';
import { CreateSession } from '../../src/contexts/identity/application/use-cases/create-session.js';
import { RegisterDevice } from '../../src/contexts/identity/application/use-cases/register-device.js';
import type { UnitOfWork } from '../../src/shared-kernel/unit-of-work.js';
import { FakeAccessTokens } from './fake-access-tokens.js';
import { FakeClock } from './fake-clock.js';
import {
  memoryIdentityHarness,
  type IdentityHarness,
} from './memory-identity.js';
import { SequentialIdGenerator } from './sequential-id-generator.js';
import { SequentialRandomSource } from './sequential-random-source.js';

export interface RegistrationFixture {
  readonly identity: IdentityHarness;
  readonly clock: FakeClock;
  readonly registerDevice: RegisterDevice;
  readonly createSession: CreateSession;
  readonly authenticateRequest: AuthenticateRequest;
  readonly tokens: FakeAccessTokens;
  /** A fresh, live nonce from the real CreateChallenge use case. */
  issueNonce(): Promise<string>;
}

export interface RegistrationFixtureOptions {
  /** Wraps the user repository, e.g. to script a race. */
  readonly wrapUsers?: (inner: UserRepository) => UserRepository;
  /** Replaces the identity harness, e.g. one that shares its unit of work with Gamification. */
  readonly identity?: {
    readonly uow: UnitOfWork;
    readonly users: UserRepository;
  };
}

/** The Identity use cases on in-memory adapters and the development verifiers (NODE_ENV=test). */
export async function registrationFixture(
  options: RegistrationFixtureOptions = {},
): Promise<RegistrationFixture> {
  const identity = await memoryIdentityHarness();
  const clock = new FakeClock();
  const challenges = new MemoryChallengeStore({ clock });
  const createChallenge = new CreateChallenge({
    challenges,
    random: new SequentialRandomSource(),
    clock,
  });
  const base = options.identity ?? identity;
  const tokens = new FakeAccessTokens(clock);
  const users = options.wrapUsers?.(base.users) ?? base.users;
  const registerDevice = new RegisterDevice({
    challenges,
    attestation: DevAttestationVerifier.forEnvironment('test'),
    users,
    tokens,
    uow: base.uow,
    ids: new SequentialIdGenerator(),
    clock,
  });
  return {
    identity,
    clock,
    registerDevice,
    createSession: new CreateSession({
      challenges,
      users,
      proofs: DevSessionProofVerifier.forEnvironment('test'),
      tokens,
      clock,
    }),
    authenticateRequest: new AuthenticateRequest({ tokens }),
    tokens,
    issueNonce: async () => {
      const created = await createChallenge.execute();
      if (!created.ok) throw new Error('challenge store is full');
      return created.value.nonce;
    },
  };
}
