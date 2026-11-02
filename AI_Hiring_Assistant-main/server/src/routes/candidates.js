import { Router } from 'express';
import { candidates, interviews, roles } from '../store/index.js';
import { asyncRoute, badRequest, notFound } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { clampScore, evaluateCandidate } from '../scoring/evaluate.js';
import { compareCandidates } from '../scoring/compare.js';
import { recordAuditEvent } from '../services/auditService.js';
import { requireRole } from '../middleware/access.js';
import { canTransition, createStageEvent } from '../services/applicationWorkflow.js';

const router = Router();
router.use(requireAuth);

async function ownedRole(roleId, userId, organizationId) {
  const role = await roles.findById(roleId);
  if (!role || (role.organizationId && role.organizationId !== organizationId) || (!role.organizationId && role.ownerId !== userId)) throw notFound('That role could not be found.');
  return role;
}

async function ownedCandidate(id, userId, organizationId) {
  const candidate = await candidates.findById(id);
  if (!candidate || (candidate.organizationId && candidate.organizationId !== organizationId) || (!candidate.organizationId && candidate.ownerId !== userId)) throw notFound('That candidate could not be found.');
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
    status: ['applied', 'screening', 'assessment', 'interview', 'offer', 'hired', 'rejected', 'withdrawn', 'pending', 'completed'].includes(String(body?.status ?? 'pending').trim()) ? String(body?.status ?? 'pending').trim() : 'pending',
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
    const role = await ownedRole(req.params.roleId, req.user.id, req.user.organizationId);
    const records = await candidates.find({ roleId: role._id }, { sort: { createdAt: 1 } });

    res.json({
      candidates: records.map((record) => present(withEvaluation(record, role.kit.rubric.dimensions))),
    });
  }),
);

router.post(
  '/roles/:roleId/candidates',
  asyncRoute(async (req, res) => {
    const role = await ownedRole(req.params.roleId, req.user.id, req.user.organizationId);
    const now = new Date().toISOString();

    const candidate = await candidates.insert({
      roleId: role._id,
      ownerId: req.user.id,
      organizationId: role.organizationId || 'nex-prototype',
      ...readDetails(req.body),
      status: 'screening',
      stageHistory: [{ from: null, to: 'screening', at: now, actorType: 'staff', actorId: req.user.id, note: 'Added by recruiter' }],
      review: { status: 'unreviewed', verifiedFields: [], notes: '', reviewedBy: null, reviewedAt: null },
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
    const existing = await ownedCandidate(req.params.id, req.user.id, req.user.organizationId);
    const role = await ownedRole(existing.roleId, req.user.id, req.user.organizationId);

    const updated = await candidates.updateById(existing._id, {
      ...readDetails({ ...req.body, status: existing.status }),
      scores: readScores(req.body, role.kit.rubric.dimensions),
      updatedAt: new Date().toISOString(),
    });

    res.json({ candidate: present(withEvaluation(updated, role.kit.rubric.dimensions)) });
  }),
);

router.delete(
  '/candidates/:id',
  asyncRoute(async (req, res) => {
    const candidate = await ownedCandidate(req.params.id, req.user.id, req.user.organizationId);
    await interviews.deleteMany({ candidateId: candidate._id });
    await candidates.deleteById(candidate._id);
    res.json({ deleted: true });
  }),
);

router.get(
  '/roles/:roleId/comparison',
  asyncRoute(async (req, res) => {
    const role = await ownedRole(req.params.roleId, req.user.id, req.user.organizationId);
    const dimensions = role.kit.rubric.dimensions;
    const records = await candidates.find({ roleId: role._id }, { sort: { createdAt: 1 } });

    res.json({
      roleTitle: role.roleInput.roleTitle,
      dimensions: dimensions.map(({ id, name, weight, description }) => ({ id, name, weight, description })),
      comparison: compareCandidates(dimensions, records.map((record) => withEvaluation(record, dimensions))),
    });
  }),
);


const APPLICATION_ROLES = ['admin','recruiter','hiring_manager','interviewer'];

router.get('/applications', requireRole(...APPLICATION_ROLES), asyncRoute(async(req,res)=>{
  const filter={organizationId:req.user.organizationId};
  if(req.query.roleId)filter.roleId=String(req.query.roleId);
  if(req.query.status)filter.status=String(req.query.status);
  const limit=Math.min(Math.max(Number(req.query.limit)||50,1),100);
  const offset=Math.max(Number(req.query.offset)||0,0);
  const all=await candidates.find(filter,{sort:{createdAt:-1}});
  const page=all.slice(offset,offset+limit);
  const roleIds=[...new Set(page.map(x=>x.roleId))];
  const roleRecords=await Promise.all(roleIds.map(id=>roles.findById(id)));
  const roleMap=new Map(roleRecords.filter(Boolean).map(role=>[role._id,role]));
  res.json({applications:page.map(c=>({id:c._id,name:c.name,email:c.email,phone:c.phone,status:c.status||'applied',currentRole:c.currentRole||'',experience:c.experience||'',skills:c.skills||[],source:c.applicationSource||'manual',roleId:c.roleId,roleTitle:roleMap.get(c.roleId)?.roleInput?.roleTitle||'Unknown role',createdAt:c.createdAt,reviewStatus:c.review?.status||'unreviewed',resumeReceived:Boolean(c.resumeProfile)})),total:all.length,limit,offset});
}));

router.get('/applications/:id', requireRole(...APPLICATION_ROLES), asyncRoute(async(req,res)=>{
  const candidate=await candidates.findById(req.params.id);
  if(!candidate||candidate.organizationId!==req.user.organizationId)throw notFound('That application could not be found.');
  const role=await roles.findById(candidate.roleId);
  if(!role||role.organizationId!==req.user.organizationId)throw notFound('That vacancy could not be found.');
  res.json({application:{id:candidate._id,...candidate,ownerId:undefined},role:{id:role._id,title:role.roleInput.roleTitle,location:role.roleInput.location,department:role.roleInput.department,rubric:role.kit.rubric}});
}));

router.patch('/applications/:id/stage', requireRole('admin','recruiter','hiring_manager'), asyncRoute(async(req,res)=>{
  const candidate=await candidates.findById(req.params.id);
  if(!candidate||candidate.organizationId!==req.user.organizationId)throw notFound('That application could not be found.');
  const next=String(req.body?.status||'');
  const current=candidate.status||'applied';
  if(!canTransition(current,next))throw badRequest('That stage transition is not allowed. Refresh the application and choose a permitted next stage.');
  const now=new Date().toISOString();
  const note=String(req.body?.note||'').trim().slice(0,1000);
  const history=[...(candidate.stageHistory||[]),createStageEvent({from:current,to:next,at:now,actorType:'staff',actorId:req.user.id,note})];
  const updated=await candidates.updateById(candidate._id,{status:next,stageHistory:history,updatedAt:now});
  await recordAuditEvent({actor:req.user,action:'application.stage_changed',resourceType:'application',resourceId:candidate._id,metadata:{from:current,to:next,note}});
  res.json({application:{id:updated._id,status:updated.status,stageHistory:updated.stageHistory}});
}));

router.patch('/applications/:id/review', requireRole('admin','recruiter','hiring_manager','interviewer'), asyncRoute(async(req,res)=>{
  const candidate=await candidates.findById(req.params.id);
  if(!candidate||candidate.organizationId!==req.user.organizationId)throw notFound('That application could not be found.');
  const allowed=new Set(['name','email','phone','experience','currentRole','skills','education','employmentHistory','certifications']);
  const supplied=Array.isArray(req.body?.verifiedFields)?req.body.verifiedFields:[];
  const profile=candidate.resumeProfile||{};
  const available={name:candidate.name,email:candidate.email,phone:candidate.phone,experience:candidate.experience,currentRole:candidate.currentRole,skills:candidate.skills,education:profile.education,employmentHistory:profile.employmentHistory,certifications:profile.certifications};
  const verified=[...new Set(supplied.filter(field=>allowed.has(field)&&((Array.isArray(available[field])&&available[field].length>0)||(!Array.isArray(available[field])&&String(available[field]||'').trim().length>0))))];
  const notes=String(req.body?.notes||'').trim().slice(0,3000);
  const now=new Date().toISOString();
  const review={status:verified.length?'reviewed':'needs_review',verifiedFields:verified,notes,reviewedBy:req.user.id,reviewedAt:now};
  const updated=await candidates.updateById(candidate._id,{review,updatedAt:now});
  await recordAuditEvent({actor:req.user,action:'application.profile_reviewed',resourceType:'application',resourceId:candidate._id,metadata:{verifiedFields:verified}});
  res.json({review:updated.review});
}));

export default router;
