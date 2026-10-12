import type { User } from '../../../src/contexts/identity/domain/user/user.js';
import { ConcurrencyConflictError } from '../../../src/shared-kernel/concurrency-conflict-error.js';
import {
  anotherUser,
  aUser,
  KEY_IDENTIFIER,
  OTHER_KEY_IDENTIFIER,
  OTHER_USER_ID,
  USER_ID,
} from '../../support/identity-builders.js';
import type { IdentityHarness } from '../../support/memory-identity.js';
import { versionedRepositoryContract } from '../support/versioned-repository.contract.js';

/** Everything a stored user must give back, compared as plain data. */
const stateOf = (user: User | undefined) =>
  user && {
    id: user.id,
    trustLevel: user.trustLevel,
    createdAt: user.createdAt,
    deviceKeys: user.deviceKeys,
  };

export function userRepositoryContract(
  makeHarness: () => Promise<IdentityHarness>,
): void {
  describe('versioning', () => {
    versionedRepositoryContract(async () => {
      const harness = await makeHarness();
      return {
        uow: harness.uow,
        newAggregate: () => aUser(),
        save: (user) => harness.users.save(user),
        load: () => harness.users.findById(USER_ID),
        dispose: () => harness.dispose(),
      };
    });
  });

  describe('storage', () => {
    let harness: IdentityHarness;
    const save = (user: User) =>
      harness.uow.run(() => harness.users.save(user));

    beforeEach(async () => {
      harness = await makeHarness();
    });

    afterEach(() => harness.dispose());

    it('loads exactly what was saved, device keys and dates included', async () => {
      // Given a registered user with a low trust level
      const user = aUser({ attestation: 'failed', platform: 'ios' });

      // When it is saved and loaded
      await save(user);
      const loaded = await harness.users.findById(USER_ID);

      // Then the loaded user has the same state
      expect(stateOf(loaded)).toEqual(stateOf(user));
    });

    it('finds a user by the identifier of their device key (FR-AUTH-02)', async () => {
      // Given a stored user
      await save(aUser());

      // When it is looked up by its key identifier and by an unknown one
      const found = await harness.users.findByKeyIdentifier(KEY_IDENTIFIER);
      const missing =
        await harness.users.findByKeyIdentifier(OTHER_KEY_IDENTIFIER);

      // Then only the own key finds the user
      expect(found?.id).toBe(USER_ID);
      expect(missing).toBeUndefined();
    });

    it('hands UserRegistered to the unit of work once, on the first save', async () => {
      // Given a newly registered user
      const user = aUser();

      // When it is saved twice, and a loaded copy is saved too
      await save(user);
      await save(user);
      const loaded = await harness.users.findById(USER_ID);
      if (loaded === undefined) throw new Error('user is not stored');
      await save(loaded);

      // Then exactly one UserRegistered for this user was delivered
      expect(harness.delivered.map((event) => event.aggregateId)).toEqual([
        USER_ID,
      ]);
    });

    it('reports a device key that already belongs to another user as a concurrency conflict, storing nothing', async () => {
      // Given a stored user
      await save(aUser());

      // When a different user with the same key identifier is saved
      const run = save(anotherUser());

      // Then it conflicts (the caller retries and finds the existing user), nothing is stored,
      // and the constraint is logged as a warning
      await expect(run).rejects.toBeInstanceOf(ConcurrencyConflictError);
      expect(await harness.users.findById(OTHER_USER_ID)).toBeUndefined();
      expect(harness.delivered).toHaveLength(1);
      expect(
        harness.logger.warnings.map((warning) => warning.fields['constraint']),
      ).toEqual(['device_keys_key_identifier_uq']);
    });

    it('stores two users with different device keys side by side', async () => {
      // Given two users with different keys
      await save(aUser());

      // When the second one is saved
      await save(anotherUser({ keyIdentifier: OTHER_KEY_IDENTIFIER }));

      // Then each key finds its own user
      expect(
        (await harness.users.findByKeyIdentifier(KEY_IDENTIFIER))?.id,
      ).toBe(USER_ID);
      expect(
        (await harness.users.findByKeyIdentifier(OTHER_KEY_IDENTIFIER))?.id,
      ).toBe(OTHER_USER_ID);
    });
  });
}
