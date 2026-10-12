/** A request that failed: a network error, a timeout or an unexpected HTTP status. */
export class ApiError extends Error {
  override readonly name = "ApiError";
  readonly url: string;
  readonly status: number | undefined;

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

/** A file whose content does not match its format, version or checksum. */
export class FormatError extends Error {
  override readonly name = "FormatError";
  readonly path: string;

  constructor(message: string, path: string) {
    super(message);
    this.path = path;
  }
}
