export class AppError extends Error { constructor(status, message, details) { super(message); this.status = status; this.details = details; } }
export const badRequest = (message, details) => new AppError(400, message, details);
export const unauthorized = (message = 'Sign in to continue') => new AppError(401, message);
export const forbidden = (message = 'You do not have permission to perform this action.') => new AppError(403, message);
export const notFound = (message = 'Not found') => new AppError(404, message);
export const upstreamFailure = (message, details) => new AppError(502, message, details);
export function asyncRoute(handler) { return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next); }
