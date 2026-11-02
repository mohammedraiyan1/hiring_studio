import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { roles, candidates } from '../store/index.js';
import { asyncRoute, badRequest, notFound } from '../lib/errors.js';
import { ORGANIZATION_ID } from '../middleware/access.js';
import { extractText } from '../rag/ingest.js';
import { extractResumeEvidence } from '../services/resumeEvidenceService.js';

const router = Router();
const windows = new Map();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, cb) => { const ext=String(file.originalname||'').toLowerCase().split('.').pop(); const allowed=(ext==='pdf'&&file.mimetype==='application/pdf')||(ext==='docx'&&file.mimetype==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'); cb(allowed?null:badRequest('Upload a PDF or DOCX resume.'),allowed); } });
const resumeUpload = (req,res,next) => upload.single('resume')(req,res,error => { if(!error)return next(); if(error.code==='LIMIT_FILE_SIZE')return next(badRequest('Resume must be 8 MB or smaller.')); return next(error); });

function applicationThrottle(req,res,next) {
  const key=req.ip || 'unknown', now=Date.now(), windowMs=15*60*1000;
  const entry=windows.get(key) || {start:now,count:0};
  if(now-entry.start>windowMs){entry.start=now;entry.count=0;}
  entry.count+=1;windows.set(key,entry);
  if(entry.count>12)return res.status(429).json({error:'Too many application attempts. Please try again later.'});
  next();
}
function publicJob(role) {
  const d=role.kit.jobDescription;
  return {id:role._id,title:d.roleTitle||role.roleInput.roleTitle,summary:d.roleSummary,location:role.roleInput.location,department:role.roleInput.department,seniority:role.roleInput.seniority,employmentType:role.roleInput.employmentType,requiredSkills:(d.requiredSkills||[]).map(x=>x.skill),responsibilities:d.keyResponsibilities||[],qualifications:d.qualifications||[],publishedAt:role.publishedAt||role.updatedAt||role.createdAt};
}
router.get('/jobs',asyncRoute(async(_req,res)=>{
  const jobs=await roles.find({organizationId:ORGANIZATION_ID,publicationStatus:'published'},{sort:{publishedAt:-1}});
  res.json({jobs:jobs.map(publicJob)});
}));
router.get('/jobs/:id',asyncRoute(async(req,res)=>{
  const role=await roles.findById(req.params.id);
  if(!role||role.organizationId!==ORGANIZATION_ID||role.publicationStatus!=='published')throw notFound('This vacancy is no longer available.');
  res.json({job:publicJob(role)});
}));
router.post('/jobs/:id/applications',applicationThrottle,resumeUpload,asyncRoute(async(req,res)=>{
  const role=await roles.findById(req.params.id);
  if(!role||role.organizationId!==ORGANIZATION_ID||role.publicationStatus!=='published')throw notFound('This vacancy is no longer accepting applications.');
  if(String(req.body?.website||'').trim())throw badRequest('Application could not be accepted.');
  const name=String(req.body?.name||'').trim().slice(0,120);
  const email=String(req.body?.email||'').trim().toLowerCase().slice(0,160);
  const phone=String(req.body?.phone||'').trim().slice(0,40);
  const coverLetter=String(req.body?.coverLetter||'').trim().slice(0,4000);
  const consent=req.body?.consent==='true'||req.body?.consent===true;
  if(name.length<2||! /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw badRequest('Enter your name and a valid email address.');
  if(!consent)throw badRequest('Consent to the candidate privacy notice is required to submit.');
  const existing=await candidates.findOne({roleId:role._id,email});
  if(existing)throw badRequest('An application with this email already exists for this vacancy.');
  const extension=String(req.file?.originalname||'').toLowerCase().split('.').pop();
  if(req.file&&!['pdf','docx'].includes(extension))throw badRequest('Upload a PDF or DOCX resume.');
  let resumeProfile=null,resumeMetadata=null;
  if(req.file){
    const signature=req.file.buffer.subarray(0,4).toString('hex');
    if(extension==='pdf'&&req.file.buffer.subarray(0,4).toString()!=='%PDF')throw badRequest('The uploaded PDF file signature is invalid.');
    if(extension==='docx'&&!['504b0304','504b0506','504b0708'].includes(signature))throw badRequest('The uploaded DOCX file signature is invalid.');
    const text=await extractText(req.file.buffer,req.file.originalname);
    if(text.length<40)throw badRequest('The resume contains too little readable text. Scanned-image OCR is not supported yet.');
    const analysis=await extractResumeEvidence(text);
    resumeProfile={...analysis.profile,extractionSource:analysis.source,reviewRequired:true};
    resumeMetadata={originalName:req.file.originalname.slice(0,180),mimeType:req.file.mimetype,sizeBytes:req.file.size,sha256:crypto.createHash('sha256').update(req.file.buffer).digest('hex'),uploadedAt:new Date().toISOString(),originalFileStored:false};
  }
  const now=new Date().toISOString();
  const candidate=await candidates.insert({
    roleId:role._id,organizationId:ORGANIZATION_ID,ownerId:role.ownerId,name,email,phone,
    experience:resumeProfile?.experience||'',currentRole:resumeProfile?.currentRole||'',skills:resumeProfile?.skills||[],
    resumeUrl:'',resumeProfile,resumeMetadata,interviewer:'',interviewDate:'',notes:coverLetter,status:'applied',
    applicationSource:'NEX careers portal',
    stageHistory:[{from:null,to:'applied',at:now,actorType:'candidate',actorId:null,note:'Application submitted'}],
    review:{status:'unreviewed',verifiedFields:[],notes:'',reviewedBy:null,reviewedAt:null},
    consent:{accepted:true,policyVersion:'prototype-privacy-v1',acceptedAt:now},scores:{},createdAt:now,updatedAt:now
  });
  res.status(201).json({application:{reference:candidate._id,status:'received',resumeReceived:Boolean(req.file),message:'Your application has been received.'}});
}));
export default router;
