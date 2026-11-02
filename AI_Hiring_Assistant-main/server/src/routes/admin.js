import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { users, auditEvents } from '../store/index.js';
import { asyncRoute, badRequest, forbidden, unauthorized } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { ORGANIZATION_ID, STAFF_ROLES, requireRole } from '../middleware/access.js';
import { recordAuditEvent } from '../services/auditService.js';
import { config } from '../config/env.js';

const router = Router();
const publicUser = (user) => ({ id: user._id, name: user.name, email: user.email, role: user.role, department: user.department || '', active: user.active !== false, createdAt: user.createdAt });

// One-time prototype bootstrap. Configure NEX_BOOTSTRAP_TOKEN out-of-band; never expose it in the browser.
router.post('/bootstrap', asyncRoute(async (req, res) => {
  if (!config.bootstrapToken || req.get('x-bootstrap-token') !== config.bootstrapToken) throw unauthorized('Invalid bootstrap credentials.');
  if (await users.findOne({ role: 'admin', organizationId: ORGANIZATION_ID })) throw forbidden('The prototype administrator has already been created.');
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (name.length < 2 || !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email) || password.length < 12) throw badRequest('Provide a name, valid email and password of at least 12 characters.');
  if (await users.findOne({ email })) throw badRequest('An account already exists for that email.');
  const user = await users.insert({ name, email, company: 'NEX Solutions (prototype)', organizationId: ORGANIZATION_ID, role: 'admin', department: 'Administration', active: true, passwordHash: await bcrypt.hash(password, 12), createdAt: new Date().toISOString() });
  await recordAuditEvent({ actor: { id: user._id, email }, action: 'admin.bootstrap', resourceType: 'user', resourceId: user._id });
  res.status(201).json({ user: publicUser(user) });
}));

router.use(requireAuth, requireRole('admin'));
router.get('/users', asyncRoute(async (_req, res) => {
  const records = await users.find({ organizationId: ORGANIZATION_ID });
  res.json({ users: records.map(publicUser) });
}));
router.patch('/users/:id', asyncRoute(async (req, res) => {
  const role = String(req.body?.role || '');
  if (!STAFF_ROLES.includes(role)) throw badRequest('Choose a valid workspace role.');
  const target = await users.findById(req.params.id);
  if (!target || target.organizationId !== ORGANIZATION_ID) throw badRequest('User not found in this workspace.');
  if (target._id === req.user.id && role !== 'admin') throw badRequest('You cannot remove your own administrator access.');
  const updated = await users.updateById(target._id, { role, updatedAt: new Date().toISOString() });
  await recordAuditEvent({ actor: req.user, action: 'user.role_changed', resourceType: 'user', resourceId: target._id, metadata: { role } });
  res.json({ user: publicUser(updated) });
}));
router.patch('/users/:id/deactivate', asyncRoute(async (req, res) => {
  const target = await users.findById(req.params.id);
  if (!target || target.organizationId !== ORGANIZATION_ID) throw badRequest('User not found in this workspace.');
  if (target._id === req.user.id) throw badRequest('You cannot deactivate your own account.');
  const updated = await users.updateById(target._id, { active: false, updatedAt: new Date().toISOString() });
  await recordAuditEvent({ actor: req.user, action: 'user.deactivated', resourceType: 'user', resourceId: target._id });
  res.json({ user: publicUser(updated) });
}));
router.get('/audit', asyncRoute(async (_req, res) => {
  const records = await auditEvents.find({ organizationId: ORGANIZATION_ID }, { sort: { createdAt: -1 } });
  res.json({ events: records.slice(0, 250) });
}));
export default router;
