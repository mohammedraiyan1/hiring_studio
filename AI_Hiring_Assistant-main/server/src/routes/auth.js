import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { users } from '../store/index.js';
import { asyncRoute, badRequest, unauthorized } from '../lib/errors.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const router = Router();

const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();
const publicUser = (user) => ({ id: user._id, name: user.name, email: user.email, company: user.company });

router.post(
  '/register',
  asyncRoute(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const name = String(req.body.name ?? '').trim();
    const password = String(req.body.password ?? '');

    if (!name) throw badRequest('Your name is required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest('Enter a valid email address.');}
    if (password.length < 8) throw badRequest('Use a password of at least 8 characters.');
    if (await users.findOne({ email })) throw badRequest('An account already exists for that email.');

    const user = await users.insert({
      name,
      email,
      company: String(req.body.company ?? '').trim(),
      passwordHash: await bcrypt.hash(password, 10),
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  }),
);

router.post(
  '/login',
  asyncRoute(async (req, res) => {
    const user = await users.findOne({ email: normalizeEmail(req.body.email) });
    const valid = user && (await bcrypt.compare(String(req.body.password ?? ''), user.passwordHash));

    // One message for both cases so the endpoint cannot be used to enumerate accounts.
    if (!valid) throw unauthorized('Email or password is incorrect.');

    res.json({ token: signToken(user), user: publicUser(user) });
  }),
);

router.get(
  '/me',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = await users.findById(req.user.id);
    if (!user) throw unauthorized('That account no longer exists.');
    res.json({ user: publicUser(user) });
  }),
);

export default router;
