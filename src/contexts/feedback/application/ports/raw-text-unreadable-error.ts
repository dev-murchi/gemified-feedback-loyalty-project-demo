/**
 * A stored raw comment cannot be opened: it was changed, belongs to another feedback, or its master
 * key is unknown. An integrity failure, not a business outcome, so it is thrown and the inbound
 * adapter answers 500 INTERNAL_ERROR (docs/07 §6); it has no API error code.
 */
export class RawTextUnreadableError extends Error {
  constructor() {
    super('The stored raw text cannot be decrypted');
    this.name = 'RawTextUnreadableError';
  }
}
