import { DevAttestationVerifier } from '../../../src/contexts/identity/adapters/outbound/dev-attestation.verifier.js';
import type { AttestationEvidence } from '../../../src/contexts/identity/application/ports/attestation-verifier.js';
import { Nonce } from '../../../src/contexts/identity/domain/challenge/nonce.js';
import { FakeDevice, type EvidenceOptions } from '../../support/fake-device.js';
import { SequentialRandomSource } from '../../support/sequential-random-source.js';

const verifier = DevAttestationVerifier.forEnvironment('test');
const nonce = Nonce.generate(new SequentialRandomSource());

const verify = (evidence: AttestationEvidence) =>
  verifier.verify({ nonce, evidence });

const platforms = [
  {
    name: 'iOS',
    evidence: (device: FakeDevice, options?: EvidenceOptions) =>
      device.iosEvidence(nonce, options),
    identifier: (device: FakeDevice) => device.iosKeyId,
  },
  {
    name: 'Android',
    evidence: (device: FakeDevice, options?: EvidenceOptions) =>
      device.androidEvidence(nonce, options),
    identifier: (device: FakeDevice) => device.androidKeyIdentifier,
  },
];

const codeOf = (result: Awaited<ReturnType<typeof verify>>) =>
  result.ok ? undefined : result.error;

describe('DevAttestationVerifier', () => {
  describe.each(platforms)('$name evidence', (platform) => {
    it('accepts a signature over the nonce and returns the device key (TC-AUTH-01)', async () => {
      // Given a device that signed the challenge with its key
      const device = new FakeDevice();

      // When the evidence is verified
      const result = await verify(platform.evidence(device));

      // Then the key is attested, identified the way the contract says
      expect(result).toEqual({
        ok: true,
        value: {
          platform: platform.name === 'iOS' ? 'ios' : 'android',
          keyIdentifier: platform.identifier(device),
          publicKey: device.publicKeyDer.toString('base64'),
          attestation: 'passed',
        },
      });
    });

    it('reports a failed platform check as a failed attestation, not a rejection (TC-AUTH-04)', async () => {
      // Given a device whose signature is right but whose integrity verdict is "fail"
      const device = new FakeDevice();

      // When the evidence is verified
      const result = await verify(
        platform.evidence(device, { integrity: 'fail' }),
      );

      // Then the key is accepted with a failed attestation (the user will be low trust)
      expect(result.ok && result.value.attestation).toBe('failed');
    });

    it.each([
      ['a signature over the raw nonce instead of its SHA-256', 'raw nonce'],
      ['a signature over a different nonce', 'other nonce'],
    ])('rejects %s', async (_title, kind) => {
      // Given a device that signed the wrong bytes
      const device = new FakeDevice();
      const wrong =
        kind === 'raw nonce'
          ? Buffer.from(nonce, 'utf8')
          : FakeDevice.iosMessage('another nonce');

      // When the evidence is verified
      const result = await verify(
        platform.evidence(device, { signedMessage: wrong }),
      );

      // Then the device did not prove it holds the key
      expect(codeOf(result)).toEqual({ code: 'SIGNATURE_INVALID' });
    });

    it('rejects a raw r‖s signature; only ASN.1 DER is accepted', async () => {
      // Given a device that signs with the WebCrypto-style raw signature
      const device = new FakeDevice();

      // When the evidence is verified
      const result = await verify(
        platform.evidence(device, { rawSignature: true }),
      );

      // Then it is rejected
      expect(codeOf(result)).toEqual({ code: 'SIGNATURE_INVALID' });
    });

    it('rejects a signature made by another key (no proof of possession)', async () => {
      // Given a device claiming a key it cannot sign with
      const device = new FakeDevice();
      const other = new FakeDevice();

      // When the evidence carries the other device's signature
      const result = await verify(platform.evidence(device, { signer: other }));

      // Then it is rejected
      expect(codeOf(result)).toEqual({ code: 'SIGNATURE_INVALID' });
    });

    it.each([
      ['a missing format', { format: undefined }],
      ['a format other than "dev"', { format: 'apple-appattest' }],
      ['an integrity verdict other than pass or fail', { integrity: 'maybe' }],
      ['a signature that is not base64', { signature: '***' }],
      ['a signature of the wrong type', { signature: 42 }],
    ])('cannot read %s', async (_title, envelope) => {
      // Given evidence whose envelope is damaged
      const device = new FakeDevice();

      // When it is verified
      const result = await verify(platform.evidence(device, { envelope }));

      // Then it is a format error on the field that carries the envelope
      expect(codeOf(result)?.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('iOS fields', () => {
    it('cannot read an attestationObject that is not base64 JSON', async () => {
      const device = new FakeDevice();
      const evidence = {
        ...device.iosEvidence(nonce),
        attestationObject: '!!',
      };
      expect(codeOf(await verify(evidence))).toEqual({
        code: 'VALIDATION_ERROR',
        field: 'attestationObject',
      });
    });

    it('rejects a keyId that is not the SHA-256 of the public key', async () => {
      const device = new FakeDevice();
      const evidence = {
        ...device.iosEvidence(nonce),
        keyId: new FakeDevice().iosKeyId,
      };
      expect(codeOf(await verify(evidence))).toEqual({
        code: 'VALIDATION_ERROR',
        field: 'keyId',
      });
    });

    it('rejects a public key that is not P-256', async () => {
      const device = new FakeDevice('secp384r1');
      expect(codeOf(await verify(device.iosEvidence(nonce)))).toEqual({
        code: 'VALIDATION_ERROR',
        field: 'attestationObject',
      });
    });
  });

  describe('Android fields', () => {
    it.each([
      ['one certificate', (leaf: string) => [leaf]],
      ['three certificates', (leaf: string) => [leaf, 'ZGV2', 'ZGV2']],
      ['a second element other than ZGV2', (leaf: string) => [leaf, 'AAAA']],
      ['a leaf that is not base64', () => ['***', 'ZGV2']],
    ])('rejects a certificateChain with %s', async (_title, chain) => {
      const device = new FakeDevice();
      const leaf = device.publicKeyDer.toString('base64');
      const evidence = {
        ...device.androidEvidence(nonce),
        certificateChain: chain(leaf),
      };
      expect(codeOf(await verify(evidence))).toEqual({
        code: 'VALIDATION_ERROR',
        field: 'certificateChain',
      });
    });

    it('rejects a public key that is not P-256', async () => {
      const device = new FakeDevice('secp384r1');
      expect(codeOf(await verify(device.androidEvidence(nonce)))).toEqual({
        code: 'VALIDATION_ERROR',
        field: 'certificateChain',
      });
    });

    it('cannot read an integrityToken that is not base64 JSON', async () => {
      const device = new FakeDevice();
      const evidence = {
        ...device.androidEvidence(nonce),
        integrityToken: '!!',
      };
      expect(codeOf(await verify(evidence))).toEqual({
        code: 'VALIDATION_ERROR',
        field: 'integrityToken',
      });
    });

    it('binds the signature to the public key: a signature over the nonce alone is rejected', async () => {
      const device = new FakeDevice();
      const evidence = device.androidEvidence(nonce, {
        signedMessage: FakeDevice.iosMessage(nonce),
      });
      expect(codeOf(await verify(evidence))).toEqual({
        code: 'SIGNATURE_INVALID',
      });
    });
  });

  describe('production guard (TC-AUTH-09, T-E3)', () => {
    it('refuses to be created with NODE_ENV=production', () => {
      // Given the production environment
      // When the development verifier is requested
      // Then it fails, so the application cannot start with it
      expect(() =>
        DevAttestationVerifier.forEnvironment('production'),
      ).toThrow();
    });

    it.each(['development', 'test', undefined])(
      'can be created with NODE_ENV=%s',
      (nodeEnv) => {
        expect(DevAttestationVerifier.forEnvironment(nodeEnv)).toBeDefined();
      },
    );
  });
});
