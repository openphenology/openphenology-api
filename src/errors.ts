// The two errors the client throws, besides RangeError for a malformed code.
// Each carries a stable `code` to branch on; messages are for people and may
// change.

/**
 * Why a request failed:
 *
 * - `network`: the request could not be sent or the connection failed;
 * - `timeout`: an attempt took longer than `timeoutMs`;
 * - `aborted`: the client's `signal` cancelled it;
 * - `status`: the server answered with an unexpected HTTP status;
 * - `not-found`: a file that must exist, such as `current.json`, does not;
 * - `release-unavailable`: the release is not published, or was withdrawn.
 */
export type ApiErrorCode =
  | "network"
  | "timeout"
  | "aborted"
  | "status"
  | "not-found"
  | "release-unavailable";

/**
 * A request that failed: a network error, a timeout, an unexpected HTTP
 * status, or a file or release that does not exist where one is required.
 */
export class ApiError extends Error {
  /** Always `ApiError`. */
  override readonly name = "ApiError";
  /** Why it failed. Stable across versions, unlike the message. */
  readonly code: ApiErrorCode;
  /** The address that was requested. */
  readonly url: string;
  /** The HTTP status, or `undefined` when no response arrived. */
  readonly status: number | undefined;

  /**
   * @param code Why it failed.
   * @param message What failed, for people.
   * @param url The address that was requested.
   * @param status The HTTP status, if a response arrived.
   * @param options The underlying error, as `cause`.
   */
  constructor(
    code: ApiErrorCode,
    message: string,
    url: string,
    status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.code = code;
    this.url = url;
    this.status = status;
  }
}

/**
 * What is wrong with a file:
 *
 * - `not-json`: it is not valid JSON;
 * - `wrong-kind`: it is a different kind of file than expected;
 * - `unsupported-version`: its format's major version is not one this
 *   version of the package reads;
 * - `malformed`: a required field is missing, or a weekly list does not have
 *   53 weeks;
 * - `checksum`: its SHA-256 does not match the release manifest.
 */
export type FormatErrorCode =
  "not-json" | "wrong-kind" | "unsupported-version" | "malformed" | "checksum";

/**
 * A file whose content does not match its format: not JSON, the wrong kind,
 * an unsupported major version, a missing field, a weekly list without 53
 * weeks, or a SHA-256 that does not match the manifest.
 */
export class FormatError extends Error {
  /** Always `FormatError`. */
  override readonly name = "FormatError";
  /** What is wrong. Stable across versions, unlike the message. */
  readonly code: FormatErrorCode;
  /** The file's path inside its release, or from the API root. */
  readonly path: string;

  /**
   * @param code What is wrong.
   * @param message What is wrong, for people, starting with the file's path.
   * @param path The file's path.
   */
  constructor(code: FormatErrorCode, message: string, path: string) {
    super(message);
    this.code = code;
    this.path = path;
  }
}
