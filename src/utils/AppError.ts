export class AppError extends Error {
  statusCode: number
  isOperational: boolean

  constructor(message: string, statusCode: number) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = true
    Error.captureStackTrace(this, this.constructor)
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') { super(message, 404) }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') { super(message, 400) }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') { super(message, 401) }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') { super(message, 403) }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') { super(message, 409) }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation error') { super(message, 400) }
}
