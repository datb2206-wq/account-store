// Lỗi nghiệp vụ có kèm HTTP status. Không phụ thuộc Next: web map sang JSON response, worker chỉ log.
export class DomainError extends Error {
  readonly isDomainError = true;

  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }

  // Không dùng instanceof: class có thể bị nạp nhiều bản (bundler của Next + Node)
  static is(err: unknown): err is DomainError {
    return typeof err === 'object' && err !== null && (err as { isDomainError?: unknown }).isDomainError === true;
  }
}

export const domainError = (status: number, message: string) => new DomainError(status, message);
