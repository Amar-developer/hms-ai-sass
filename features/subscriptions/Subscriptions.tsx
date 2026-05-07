'use client';

import {useEffect,useState} from 'react';
import {Badge,Card} from '@/components/ui';
import {apiFetch} from '@/lib/api';

export function Subscriptions({apiSession}:any){
 const [plans,setPlans]=useState<any[]>([]);
 const [message,setMessage]=useState('');
 useEffect(()=>{let alive=true;async function load(){if(!apiSession)return;try{const rows=await apiFetch('/subscription-plans',apiSession);if(alive)setPlans(rows)}catch(err:any){if(alive)setMessage(err.message||'Could not load subscriptions.')}}load();return()=>{alive=false}},[apiSession?.token,apiSession?.tenantId]);
 if(!apiSession)return <Card><h3 className="text-lg font-bold">Subscriptions</h3><p className="mt-2 text-sm text-slate-500">Backend login is required to view subscription plans.</p></Card>;
 return <div className="space-y-4">{message&&<div className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">{message}</div>}<div className="grid gap-4 md:grid-cols-3">{plans.length===0&&<Card><h3 className="text-lg font-bold">No Plans</h3><p className="mt-2 text-sm text-slate-500">No subscription plans are available for this tenant scope.</p></Card>}{plans.map((plan:any)=><Card key={plan.id}><h3 className="text-lg font-bold">{plan.name}</h3><p className="mt-2 text-2xl font-bold">₹{plan.monthly_price ?? plan.price ?? 0}</p><p className="mt-1 text-sm text-slate-500">{plan.status || (plan.is_active?'active':'inactive')}</p><div className="mt-4 flex flex-wrap gap-2">{(plan.enabled_modules||plan.features||[]).map((feature:string)=><Badge key={feature} tone="green">{feature}</Badge>)}</div></Card>)}</div></div>
}
