'use client';

import {CalendarDays,Clock,IndianRupee,Users} from 'lucide-react';
import {Badge,Card} from '@/components/ui';

function rupees(value:any){return `₹${Number(value||0).toLocaleString('en-IN')}`}

export function Dashboard({clinic,scopedAppointments,patients,liveSummary,setActive}:any){
  const cards=[
    ['Appointments',liveSummary?.appointments??scopedAppointments.length,CalendarDays,'appointments'],
    ['Patients',liveSummary?.patients??patients.length,Users,'patients'],
    ['Queue',liveSummary?.queue??0,Clock,'queue'],
    ['Due',rupees(liveSummary?.invoiceBalance??0),IndianRupee,'billing'],
  ];
  const liveCards=[
    ['Patients',liveSummary?.patients??patients.length,'patients'],
    ['Appointments',liveSummary?.appointments??scopedAppointments.length,'appointments'],
    ['Invoices',liveSummary?.invoices??0,'billing'],
    ['Balance',rupees(liveSummary?.invoiceBalance??0),'billing'],
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map(([title,value,Icon,target]:any)=>(
          <button
            key={title}
            type="button"
            onClick={()=>setActive?.(target)}
            className="rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
          >
            <Icon className="mb-3 text-slate-500"/>
            <p className="text-sm text-slate-500">{title}</p>
            <p className="mt-1 text-2xl font-bold">{value}</p>
          </button>
        ))}
      </div>

      {liveSummary&&(
        <Card>
          <h3 className="text-lg font-bold">Live Backend Data</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {liveCards.map(([title,value,target]:any)=>(
              <button
                key={title}
                type="button"
                onClick={()=>setActive?.(target)}
                className="rounded-2xl bg-slate-50 p-4 text-left transition hover:bg-slate-100"
              >
                <p className="text-sm text-slate-500">{title}</p>
                <p className="font-bold">{value}</p>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h3 className="text-lg font-bold">Enabled Plug-and-Play Modules</h3>
        <div className="mt-4 flex flex-wrap gap-2">{clinic.modules.map((m:string)=><Badge key={m} tone="green">{m}</Badge>)}</div>
      </Card>
    </div>
  );
}
