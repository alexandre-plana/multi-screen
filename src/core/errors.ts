/** Raised when untrusted data (network, URL, storage) is not a valid screen or message. */
export class ValidationError extends Error {
  override readonly name = 'ValidationError';
  constructor(
    message: string,
    readonly path: string = '',
  ) {
    super(path ? `${path}: ${message}` : message);
  }
}
