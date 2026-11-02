import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import { storeKind } from './store/index.js';
import { knowledgeStats } from './rag/knowledgeBase.js';
import { isGeminiEnabled } from './ai/gemini.js';
import { TOP_K } from './rag/retriever.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import roleRoutes from './routes/roles.js';
import candidateRoutes from './routes/candidates.js';
import interviewRoutes from './routes/interviews.js';
import resumeRoutes from './routes/resume.js';
import knowledgeRoutes from './routes/knowledge.js';
import adminRoutes from './routes/admin.js';
export function createApp() {
 const app=express();
 app.use(cors({origin:config.clientOrigins.length?config.clientOrigins:true,methods:['GET','POST','PUT','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization','X-Bootstrap-Token']}));
 app.use(express.json({limit:'1mb'}));
 app.get('/api/health',(_req,res)=>res.json({ok:true,storage:storeKind(),environment:config.nodeEnv,ai:{provider:'google-gemini',configured:isGeminiEnabled(),model:isGeminiEnabled()?config.gemini.model:null,mode:isGeminiEnabled()?'live':'offline-demo'},retrieval:{topK:TOP_K,...knowledgeStats()}}));
 app.use('/api/auth',authRoutes); app.use('/api/admin',adminRoutes); app.use('/api/roles',roleRoutes); app.use('/api',candidateRoutes); app.use('/api',interviewRoutes); app.use('/api',resumeRoutes); app.use('/api/knowledge',knowledgeRoutes);
 const clientDist=path.resolve(config.serverRoot,'../client/dist');
 if(fs.existsSync(path.join(clientDist,'index.html'))){app.use(express.static(clientDist));app.get(/^\/(?!api\/).*/,(_req,res)=>res.sendFile(path.join(clientDist,'index.html')));}
 app.use(notFoundHandler); app.use(errorHandler); return app;
}
