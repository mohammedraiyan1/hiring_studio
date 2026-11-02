import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { unauthorized } from '../lib/errors.js';

export function signToken(user) {
  return jwt.sign({ sub: user._id, email: user.email, name: user.name, role: user.role || 'recruiter', organizationId: user.organizationId || 'nex-prototype' }, config.auth.secret, { expiresIn: config.auth.tokenTtl });
}

export function requireAuth(req, _res, next) {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, config.auth.secret);
    req.user = { id: payload.sub, email: payload.email, name: payload.name, role: payload.role || 'recruiter', organizationId: payload.organizationId || 'nex-prototype' };
    return next();
  } catch { return next(unauthorized('Your session has expired. Sign in again.')); }
}
