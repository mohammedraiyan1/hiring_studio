import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { unauthorized } from '../lib/errors.js';
import { users } from '../store/index.js';

export function signToken(user) {
  return jwt.sign({ sub: user._id }, config.auth.secret, { expiresIn: config.auth.tokenTtl });
}

export async function requireAuth(req, _res, next) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, config.auth.secret);
    const account = await users.findById(payload.sub);
    if (!account || account.active === false) return next(unauthorized('Your account is no longer active.'));
    req.user = { id: account._id, email: account.email, name: account.name, role: account.role || 'recruiter', organizationId: account.organizationId || 'nex-prototype' };
    return next();
  } catch {
    return next(unauthorized('Your session has expired. Sign in again.'));
  }
}
