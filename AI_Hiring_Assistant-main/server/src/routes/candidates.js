import { Router } from 'express';
import { candidates, interviews, roles } from '../store/index.js';
import { asyncRoute, badRequest, notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { clampScore, evaluateCandidate } from '../scoring/evaluate.js';
import { compareCandidates } from '../scoring/compare.js';

const router = Router();
router.use(requireAuth);

async function ownedRole(roleId, userId) {
  const role = await roles.findById(roleId);
  if (!role || (role.organizationId && role.organizationId !== 'nex-prototype') || (!role.organizationId && role.ownerId !== userId)) throw notFound('That role could not be found.');
  return role;
}

async function ownedCandidate(id, userId) {
  const candidate = await candidates.findById(id);
  if (!candidate || (candidate.organizationId && candidate.organizationId !== 'nex-prototype') || (!candidate.organizationId && candidate.ownerId !== userId)) throw notFound('That candidate could not be found.');
  return candidate;
}

/** Scores are keyed by rubric dimension id; anything else in the payload is dropped. */
function readScores(body, dimensions) {
  const incoming = body?.scores ?? {};
  const scores = {};

  for (const dimension of dimensions) {
    const entry = incoming[dimension.id];
    if (!entry) continue;
    const score = clampScore(entry.score);
    const evidence = String(entry.evidence ?? '').trim().slice(0, 2000);
    if (score === null && !evidence) continue;
    scores[dimension.id] = { score, evidence };
  }

  return scores;
}

function readDetails(body) {
  const name = String(body?.name ?? '').trim().slice(0, 120);
  if (name.length < 2) throw badRequest('A candidate name is required.');

  return {
    name,
    email: String(body?.email ?? '').trim().slice(0, 160),
    phone: String(body?.phone ?? '').trim().slice(0, 40),
    experience: String(body?.experience ?? '').trim().slice(0, 80),
    currentRole: String(body?.currentRole ?? '').trim().slice(0, 160),
    skills: Array.isArray(body?.skills)
      ? body.skills.map((skill) => String(skill).trim().slice(0, 80)).filter(Boolean).slice(0, 30)
      : String(body?.skills ?? '').split(',').map((skill) => skill.trim().slice(0, 80)).filter(Boolean).slice(0, 30),
    resumeUrl: String(body?.resumeUrl ?? '').trim().slice(0, 500),
    interviewer: String(body?.interviewer ?? '').trim().slice(0, 120),
    interviewDate: String(body?.interviewDate ?? '').slice(0, 30),
    notes: String(body?.notes ?? '').trim().slice(0, 4000),
    status: String(body?.status ?? 'pending').trim() === 'completed' ? 'completed' : 'pending',
  };
}

// Evaluation is derived from the stored scores rather than saved alongside them,
// so there is one source of truth for a candidate's numbers.
const withEvaluation = (candidate, dimensions) => ({
  ...candidate,
  evaluation: evaluateCandidate(dimensions, candidate.scores),
});

const present = ({ _id, ownerId, ...candidate }) => ({ id: _id, ...candidate });

router.get(
  '/roles/:roleId/candidates',
  asyncRoute(async (req, res) => {
    const role = await ownedRole(req.params.roleId, req.user.id);
    const records = await candidates.find({ roleId: role._id }, { sort: { createdAt: 1 } });

    res.json({
      candidates: records.map((record) => present(withEvaluation(record, role.kit.rubric.dimensions))),
    });
  }),
);

router.post(
  '/roles/:roleId/candidates',
  asyncRoute(async (req, res) => {
    const role = await ownedRole(req.params.roleId, req.user.id);
    const now = new Date().toISOString();

    const candidate = await candidates.insert({
      roleId: role._id,
      ownerId: req.user.id,
      organizationId: role.organizationId || 'nex-prototype',
      ...readDetails(req.body),
      scores: readScores(req.body, role.kit.rubric.dimensions),
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({ candidate: present(withEvaluation(candidate, role.kit.rubric.dimensions)) });
  }),
);

router.put(
  '/candidates/:id',
  asyncRoute(async (req, res) => {
    const existing = await ownedCandidate(req.params.id, req.user.id);
    const role = await ownedRole(existing.roleId, req.user.id);

    const updated = await candidates.updateById(existing._id, {
      ...readDetails(req.body),
      scores: readScores(req.body, role.kit.rubric.dimensions),
      updatedAt: new Date().toISOString(),
    });

    res.json({ candidate: present(withEvaluation(updated, role.kit.rubric.dimensions)) });
  }),
);

router.delete(
  '/candidates/:id',
  asyncRoute(async (req, res) => {
    const candidate = await ownedCandidate(req.params.id, req.user.id);
    await interviews.deleteMany({ candidateId: candidate._id });
    await candidates.deleteById(candidate._id);
    res.json({ deleted: true });
  }),
);

router.get(
  '/roles/:roleId/comparison',
  asyncRoute(async (req, res) => {
    const role = await ownedRole(req.params.roleId, req.user.id);
    const dimensions = role.kit.rubric.dimensions;
    const records = await candidates.find({ roleId: role._id }, { sort: { createdAt: 1 } });

    res.json({
      roleTitle: role.roleInput.roleTitle,
      dimensions: dimensions.map(({ id, name, weight, description }) => ({ id, name, weight, description })),
      comparison: compareCandidates(dimensions, records.map((record) => withEvaluation(record, dimensions))),
    });
  }),
);

export default router;
