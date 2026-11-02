import { forbidden } from '../lib/errors.js';

export const ORGANIZATION_ID = 'nex-prototype';
export const STAFF_ROLES = ['admin', 'recruiter', 'hiring_manager', 'interviewer'];

export function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) return next(forbidden('You do not have permission to perform this action.'));
    if (req.user.organizationId !== ORGANIZATION_ID) return next(forbidden('Your account is not part of this workspace.'));
    return next();
  };
}
