import { Router } from 'express';
import { roles, candidates } from '../store/index.js';
import { asyncRoute, badRequest, notFound } from '../lib/errors.js';
import { ORGANIZATION_ID } from '../middleware/access.js';

const router=Router();
const windows=new Map();
function applicationThrottle(req,res,next){const key=req.ip||'unknown',now=Date.now(),windowMs=15*60*1000;const entry=windows.get(key)||{start:now,count:0};if(now-entry.start>windowMs){entry.start=now;entry.count=0;}entry.count+=1;windows.set(key,entry);if(entry.count>12)return res.status(429).json({error:'Too many application attempts. Please try again later.'});next();}
function publicJob(role){const d=role.kit.jobDescription;return{id:role._id,title:d.roleTitle||role.roleInput.roleTitle,summary:d.roleSummary,location:role.roleInput.location,department:role.roleInput.department,seniority:role.roleInput.seniority,employmentType:role.roleInput.employmentType,requiredSkills:(d.requiredSkills||[]).map(x=>x.skill),responsibilities:d.keyResponsibilities||[],qualifications:d.qualifications||[],publishedAt:role.publishedAt||role.updatedAt||role.createdAt};}
router.get('/jobs',asyncRoute(async(_req,res)=>{const jobs=await roles.find({organizationId:ORGANIZATION_ID,publicationStatus:'published'},{sort:{publishedAt:-1}});res.json({jobs:jobs.map(publicJob)});}));
router.get('/jobs/:id',asyncRoute(async(req,res)=>{const role=await roles.findById(req.params.id);if(!role||role.organizationId!==ORGANIZATION_ID||role.publicationStatus!=='published')throw notFound('This vacancy is no longer available.');res.json({job:publicJob(role)});}));
router.post('/jobs/:id/applications',applicationThrottle,asyncRoute(async(req,res)=>{
 const role=await roles.findById(req.params.id);if(!role||role.organizationId!==ORGANIZATION_ID||role.publicationStatus!=='published')throw notFound('This vacancy is no longer accepting applications.');
 if(String(req.body?.website||'').trim())throw badRequest('Application could not be accepted.');
 const name=String(req.body?.name||'').trim().slice(0,120),email=String(req.body?.email||'').trim().toLowerCase().slice(0,160),phone=String(req.body?.phone||'').trim().slice(0,40),coverLetter=String(req.body?.coverLetter||'').trim().slice(0,4000),consent=req.body?.consent===true;
 if(name.length<2||! /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email))throw badRequest('Enter your name and a valid email address.');if(!consent)throw badRequest('Consent to the candidate privacy notice is required to submit.');
 const existing=await candidates.findOne({roleId:role._id,email});if(existing)throw badRequest('An application with this email already exists for this vacancy.');
 const now=new Date().toISOString();
 const candidate=await candidates.insert({roleId:role._id,organizationId:ORGANIZATION_ID,ownerId:role.ownerId,name,email,phone,experience:'',currentRole:'',skills:[],resumeUrl:'',interviewer:'',interviewDate:'',notes:coverLetter,status:'applied',applicationSource:'NEX careers prototype',consent:{accepted:true,policyVersion:'prototype-privacy-v1',acceptedAt:now},scores:{},createdAt:now,updatedAt:now});
 res.status(201).json({application:{reference:candidate._id,status:'received',message:'Your application has been received. This prototype does not yet send email confirmations.'}});
}));
export default router;
