import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { Badge, Button, Card, EmptyState, Note } from '../components/ui';

const stages=['applied','screening','assessment','interview','offer','hired','rejected','withdrawn'];
export default function ApplicationsPage(){
 const [params,setParams]=useSearchParams();
 const [data,setData]=useState(null),[error,setError]=useState('');
 const status=params.get('status')||'all';
 useEffect(()=>{setData(null);api.listApplications(status==='all'?{}:{status}).then(setData).catch(e=>setError(e.message));},[status]);
 return <div className="space-y-5">
  <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="label">Recruitment operations</p><h1 className="mt-2 text-2xl font-semibold">Applications</h1><p className="mt-1 text-sm text-ink-2">Review incoming applications, verify CV evidence and move candidates through the hiring process.</p></div><Link to="/"><Button variant="secondary">All vacancies</Button></Link></header>
  <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2">{['all',...stages].map(x=><button key={x} onClick={()=>setParams(x==='all'?{}:{status:x})} className={'rounded-full border px-3 py-1.5 text-xs '+(status===x?'border-accent bg-accent text-ink':'border-line text-ink-2')}>{x==='all'?'All applications':x[0].toUpperCase()+x.slice(1)}</button>)}</div><p className="text-xs text-muted">{data?data.total+' applications':'Loading…'}</p></div>
  {error?<Note tone="critical">{error}</Note>:null}
  {!data&&!error?<div className="grid gap-3">{[1,2,3].map(x=><div key={x} className="skeleton h-20"/>)}</div>:null}
  {data&&data.applications.length===0?<Card><EmptyState title="No applications in this view">Applications submitted through the NEX Careers portal will appear here. Publish a vacancy and submit a test application to verify the workflow.</EmptyState></Card>:null}
  {data?.applications.length>0?<Card><div className="divide-y divide-line">{data.applications.map(a=><div key={a.id} className="flex flex-wrap items-center gap-4 px-5 py-4"><div className="min-w-0 flex-1"><Link to={'/applications/'+a.id} className="font-semibold hover:underline">{a.name}</Link><p className="mt-1 text-xs text-muted">{a.roleTitle} · {a.email}</p><p className="mt-1 text-xs text-muted">{a.currentRole||'Role not extracted'} · {a.experience||'Experience not stated'}</p></div><div className="flex flex-wrap items-center gap-2"><Badge tone={a.reviewStatus==='reviewed'?'good':'warning'}>{a.reviewStatus}</Badge>{a.resumeReceived?<Badge>CV received</Badge>:<Badge>CV missing</Badge>}<Badge>{a.status}</Badge><Link to={'/applications/'+a.id}><Button size="sm" variant="secondary">Review profile</Button></Link></div></div>)}</div></Card>:null}
 </div>;
}
