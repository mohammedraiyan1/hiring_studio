import { Router } from 'express';
import { candidates, interviews, roles } from '../store/index.js';
import { asyncRoute, badRequest, notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { clampScore } from '../scoring/evaluate.js';
import { recordAuditEvent } from '../services/auditService.js';
import { canTransition, createStageEvent } from '../services/applicationWorkflow.js';

const router = Router();
router.use(requireAuth);

async function ownedCandidate(candidateId, userId) {
  const candidate = await candidates.findById(candidateId);
  if (!candidate || (candidate.organizationId && candidate.organizationId !== 'nex-prototype') || (!candidate.organizationId && candidate.ownerId !== userId)) throw notFound('That candidate could not be found.');
  const role = await roles.findById(candidate.roleId);
  if (!role || (role.organizationId && role.organizationId !== 'nex-prototype') || (!role.organizationId && role.ownerId !== userId)) throw notFound('That role could not be found.');
  return { candidate, role };
}

function readAnswers(body, role) {
  const incoming = Array.isArray(body?.answers) ? body.answers : [];
  const questions = Object.values(role.kit.interviewQuestions).flat();
  const allowed = new Map(questions.map((question) => [question.id, question]));

  return incoming
    .filter((answer) => allowed.has(answer?.questionId))
    .slice(0, questions.length)
    .map((answer) => ({
      questionId: answer.questionId,
      answer: String(answer.answer ?? '').trim().slice(0, 8000),
      score: clampScore(answer.score),
      interviewerNotes: String(answer.interviewerNotes ?? '').trim().slice(0, 4000),
      answeredAt: answer.answeredAt || new Date().toISOString(),
    }));
}

function readDimensionScores(body, role) {
  const incoming = body?.dimensionScores ?? {};
  return Object.fromEntries(
    role.kit.rubric.dimensions.flatMap((dimension) => {
      const entry = incoming[dimension.id];
      const score = clampScore(entry?.score ?? entry);
      return score === null ? [] : [[dimension.id, { score, evidence: String(entry?.evidence ?? '').trim().slice(0, 2000) }]];
    }),
  );
}

async function saveInterview(req, res, status = 'in_progress') {
  const { candidate, role } = await ownedCandidate(req.params.candidateId, req.user.id);
  const answers = readAnswers(req.body, role);
  const dimensionScores = readDimensionScores(req.body, role);
  const now = new Date().toISOString();
  const existing = await interviews.findOne({ candidateId: candidate._id, userId: req.user.id });
  const record = {
    candidateId: candidate._id,
    jobId: role._id,
    userId: req.user.id,
    answers,
    dimensionScores,
    redFlags: Array.isArray(req.body?.redFlags) ? req.body.redFlags.map((item) => String(item).trim().slice(0, 500)).filter(Boolean).slice(0, 20) : [],
    additionalNotes: String(req.body?.additionalNotes ?? '').trim().slice(0, 8000),
    status,
    startedAt: existing?.startedAt || now,
    completedAt: status === 'completed' ? now : existing?.completedAt || null,
    updatedAt: now,
  };
  const saved = existing ? await interviews.updateById(existing._id, record) : await interviews.insert(record);
  if (status === 'completed') {
    await candidates.updateById(candidate._id, { scores: dimensionScores, status: 'interview', updatedAt: now });
  }
  res.json({ interview: { id: saved._id, ...saved }, candidateId: candidate._id });
}

router.get('/candidates/:candidateId/interview', asyncRoute(async (req, res) => {
  const { candidate, role } = await ownedCandidate(req.params.candidateId, req.user.id);
  const interview = await interviews.findOne({ candidateId: candidate._id, userId: req.user.id });
  res.json({ interview, candidate: { id: candidate._id, name: candidate.name, email: candidate.email, skills: candidate.skills ?? [] }, role: { id: role._id, roleTitle: role.roleInput.roleTitle, kit: role.kit } });
}));

router.post('/candidates/:candidateId/interview', asyncRoute(async (req, res) => saveInterview(req, res)));
router.put('/candidates/:candidateId/interview', asyncRoute(async (req, res) => saveInterview(req, res)));
router.post('/candidates/:candidateId/interview/submit', asyncRoute(async (req, res) => {
  const { role } = await ownedCandidate(req.params.candidateId, req.user.id);
  const answers = readAnswers(req.body, role);
  const scores = readDimensionScores(req.body, role);
  const questions = Object.values(role.kit.interviewQuestions).flat();
  if (answers.length !== questions.length || answers.some((answer) => answer.score === null)) {
    throw badRequest('Score every interview question before submitting.');
  }
  if (Object.keys(scores).length !== role.kit.rubric.dimensions.length) {
    throw badRequest('Score every rubric dimension before submitting.');
  }
  return saveInterview(req, res, 'completed');
}));

export default router;