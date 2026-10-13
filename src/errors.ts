/**
 * A request that failed: a network error, a timeout, an unexpected HTTP
 * status, or a file or release that does not exist where one is required.
 */
export class ApiError extends Error {
  /** Always `ApiError`. */
  override readonly name = "ApiError";
  /** The address that was requested. */
  readonly url: string;
  /** The HTTP status, or `undefined` after a network error or timeout. */
  readonly status: number | undefined;

  /**
   * @param message What failed.
   * @param url The address that was requested.
   * @param status The HTTP status, if a response arrived.
   * @param options The underlying error, as `cause`.
   */
  constructor(
    message: string,
    url: string,
    status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.url = url;
    this.status = status;
  }
}

/**
 * A file whose content does not match its format: not JSON, the wrong kind,
 * an unsupported major version, a missing field, a weekly list without 53
 * weeks, or a SHA-256 that does not match the manifest.
 */
export class FormatError extends Error {
  /** Always `FormatError`. */
  override readonly name = "FormatError";
  /** The file's path inside its release, or from the API root. */
  readonly path: string;

  /**
   * @param message What is wrong, starting with the file's path.
   * @param path The file's path.
   */
  constructor(message: string, path: string) {
    super(message);
    this.path = path;
  }
}
