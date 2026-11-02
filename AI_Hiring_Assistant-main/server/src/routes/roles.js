import { Router } from 'express';
import { candidates, interviews, roles } from '../store/index.js';
import { asyncRoute, badRequest, notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { generateHiringKit } from '../services/hiringKitService.js';
import PDFDocument from 'pdfkit';
import { ORGANIZATION_ID, requireRole } from '../middleware/access.js';
import { recordAuditEvent } from '../services/auditService.js';

const router = Router();
router.use(requireAuth);

const FIELD_LIMITS = {
  roleTitle: 120,
  seniority: 60,
  employmentType: 60,
  location: 120,
  department: 80,
  companyName: 120,
  companySize: 60,
  industry: 80,
  responsibilitiesHint: 2000,
  mustHaveSkills: 600,
  cultureNotes: 1200,
  compensationNotes: 600,
};

function readRoleInput(body) {
  const roleInput = {};
  for (const [field, limit] of Object.entries(FIELD_LIMITS)) {
    roleInput[field] = String(body?.[field] ?? '').trim().slice(0, limit);
  }

  if (roleInput.roleTitle.length < 2) throw badRequest('A role title is required.');
  if (roleInput.responsibilitiesHint.length < 20) {
    throw badRequest('Describe the role in a sentence or two so the generated kit is specific to it.');
  }

  return roleInput;
}

const summarise = (role, candidateCount) => ({
  id: role._id,
  roleTitle: role.roleInput.roleTitle,
  seniority: role.roleInput.seniority,
  department: role.roleInput.department,
  location: role.roleInput.location,
  dimensionCount: role.kit.rubric.dimensions.length,
  questionCount: Object.values(role.kit.interviewQuestions).flat().length,
  alignmentScore: role.alignment.score,
  generationSource: role.generation.source,
  retrievalMode: role.retrieval.mode,
  candidateCount,
  publicationStatus: role.publicationStatus || 'draft',
  publishedAt: role.publishedAt || null,
  createdAt: role.createdAt,
});

const present = ({ _id, ...role }) => ({ id: _id, ...role });

async function ownedRole(req) {
  const role = await roles.findById(req.params.id);
  if (!role || (role.organizationId !== req.user.organizationId && role.ownerId !== req.user.id)) throw notFound('That role could not be found.');
  return role;
}

router.get(
  '/',
  asyncRoute(async (req, res) => {
    const [owned, allCandidates] = await Promise.all([
      roles.find({ organizationId: req.user.organizationId }, { sort: { createdAt: -1 } }),
      candidates.find({ organizationId: req.user.organizationId }),
    ]);

    const counts = allCandidates.reduce(
      (accumulator, candidate) => accumulator.set(candidate.roleId, (accumulator.get(candidate.roleId) ?? 0) + 1),
      new Map(),
    );

    res.json({
      roles: owned
        .map((role) => summarise(role, counts.get(role._id) ?? 0))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    });
  }),
);

router.put(
  '/:id',
  asyncRoute(async (req, res) => {
    const role = await ownedRole(req);
    const nextKit = req.body?.kit;
    if (!nextKit || typeof nextKit !== 'object') throw badRequest('A saved hiring kit is required.');

    const dimensions = nextKit?.rubric?.dimensions;
    if (!Array.isArray(dimensions) || dimensions.length < 5 || dimensions.length > 7) {
      throw badRequest('A rubric must contain between 5 and 7 dimensions.');
    }
    const totalWeight = dimensions.reduce((sum, dimension) => sum + Number(dimension.weight || 0), 0);
    if (!dimensions.every((dimension) => Number.isFinite(Number(dimension.weight)) && Number(dimension.weight) >= 0)) {
      throw badRequest('Rubric weights must be zero or greater.');
    }
    if (totalWeight <= 0) throw badRequest('At least one rubric weight is required.');

    const updated = await roles.updateById(role._id, {
      kit: nextKit,
      updatedAt: new Date().toISOString(),
    });
    res.json({ role: present(updated) });
  }),
);

router.post(
  '/',
  asyncRoute(async (req, res) => {
    const roleInput = readRoleInput(req.body);
    const generated = await generateHiringKit(roleInput);

    const role = await roles.insert({
      ownerId: req.user.id,
      organizationId: ORGANIZATION_ID,
      publicationStatus: 'draft',
      roleInput,
      ...generated,
      createdAt: new Date().toISOString(),
    });

    await recordAuditEvent({ actor: req.user, action: 'role.created', resourceType: 'role', resourceId: role._id, metadata: { roleTitle: roleInput.roleTitle } });
    res.status(201).json({ role: present(role) });
  }),
);

router.post('/:id/publish', requireRole('admin', 'recruiter', 'hiring_manager'), asyncRoute(async (req, res) => {
  const role = await ownedRole(req);
  const updated = await roles.updateById(role._id, { publicationStatus: 'published', publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await recordAuditEvent({ actor: req.user, action: 'role.published', resourceType: 'role', resourceId: role._id });
  res.json({ role: present(updated) });
}));
router.post('/:id/unpublish', requireRole('admin', 'recruiter', 'hiring_manager'), asyncRoute(async (req, res) => {
  const role = await ownedRole(req);
  const updated = await roles.updateById(role._id, { publicationStatus: 'draft', updatedAt: new Date().toISOString() });
  await recordAuditEvent({ actor: req.user, action: 'role.unpublished', resourceType: 'role', resourceId: role._id });
  res.json({ role: present(updated) });
}));

router.get(
  '/:id',
  asyncRoute(async (req, res) => {
    res.json({ role: present(await ownedRole(req)) });
  }),
);

router.get(
  '/:id/pdf',
  asyncRoute(async (req, res) => {
    const role = await ownedRole(req);
    const description = role.kit.jobDescription;
    const input = role.roleInput;
    const filename = `${description.roleTitle || input.roleTitle}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'job-description';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);

    const document = new PDFDocument({ size: 'A4', margin: 54 });
    document.pipe(res);
    document.font('Helvetica-Bold').fontSize(24).fillColor('#1A1A1A').text(description.roleTitle || input.roleTitle);
    document.moveDown(0.4);
    document.font('Helvetica').fontSize(10).fillColor('#666666').text(
      [input.seniority, input.department, input.location, input.companyName].filter(Boolean).join('  | '),
    );
    document.moveDown(1.2);

    const heading = (title) => {
      document.moveDown(0.5);
      document.font('Helvetica-Bold').fontSize(13).fillColor('#1A1A1A').text(title);
      document.moveDown(0.25);
    };
    const body = (text) => document.font('Helvetica').fontSize(10.5).fillColor('#333333').text(text, { lineGap: 3 });

    heading('Role summary');
    body(description.roleSummary);

    heading('Key responsibilities');
    description.keyResponsibilities.forEach((item) => body(`- ${item}`));

    heading('Required skills');
    description.requiredSkills.forEach((item) => {
      const detail = [item.skill, item.proficiency, item.why].filter(Boolean).join(' - ');
      body(`- ${detail}`);
    });

    if (description.niceToHaveSkills?.length) {
      heading('Nice to have');
      description.niceToHaveSkills.forEach((item) => body(`- ${[item.skill, item.why].filter(Boolean).join(' - ')}`));
    }

    if (description.qualifications?.length) {
      heading('Qualifications');
      description.qualifications.forEach((item) => body(`- ${item}`));
    }

    heading('Compensation guidance');
    body(description.compensationGuidance);

    heading('Why join us');
    body(description.whyJoinUs);

    if (description.whatWeLookFor) {
      heading('What we look for');
      body(description.whatWeLookFor);
    }

    document.end();
  }),
);

router.delete(
  '/:id',
  asyncRoute(async (req, res) => {
    const role = await ownedRole(req);
    await candidates.deleteMany({ roleId: role._id });
    await interviews.deleteMany({ jobId: role._id });
    await roles.deleteById(role._id);
    res.json({ deleted: true });
  }),
);

export default router;
