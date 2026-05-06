'use client';

import {Badge,Card} from '@/components/ui';
import {subscriptions} from '@/lib/mockData';

export function Subscriptions(){return <div className="grid gap-4 md:grid-cols-3">{subscriptions.map(s=><Card key={s.id}><h3 className="text-lg font-bold">{s.name}</h3><p className="mt-2 text-2xl font-bold">{s.price}</p><div className="mt-4 flex flex-wrap gap-2">{s.features.map(f=><Badge key={f} tone="green">{f}</Badge>)}</div></Card>)}</div>}
