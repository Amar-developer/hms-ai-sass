'use client';

import {Card} from '@/app/components/common/ui';

export function SimpleList({title,rows}:any){return <Card><h3 className="text-lg font-bold">{title}</h3><div className="mt-4 grid gap-3">{rows.map((r:any)=><div key={r.id} className="rounded-2xl bg-slate-50 p-4"><b>{r.id}</b><pre className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{JSON.stringify(r,null,2)}</pre></div>)}</div></Card>}
