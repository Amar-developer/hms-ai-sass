'use client';

import {useEffect,useState} from 'react';
import {Badge,Card,Field,Select} from '@/components/ui';
import {apiFetch,type ApiSession} from '@/lib/api';
import {sortQueue} from '@/lib/hmsLogic';

type TokenQueueProps = {
  scopedAppointments: any[];
  appointments: any[];
  setAppointments: (value: any[]) => void;
  apiSession: ApiSession | null;
  loadLiveData: (session: ApiSession) => Promise<void>;
};

type QueueAction = 'call' | 'skip' | 'requeue' | 'cancel';

export function TokenQueue({
  scopedAppointments,
  appointments,
  setAppointments,
  apiSession,
  loadLiveData,
}: TokenQueueProps) {
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [displayMode,setDisplayMode]=useState<'reception'|'called_only'>('reception');
  const [tokenLanguage,setTokenLanguage]=useState<'english'|'tamil'|'both'>('english');
  const [displayRows,setDisplayRows]=useState<any[]>([]);
  const queue = sortQueue(scopedAppointments);
  const visibleQueue=displayMode==='called_only'?queue.filter((appointment:any)=>appointment.queueStatus==='called'||appointment.queueStatus==='Called'):queue;

  useEffect(()=>{
    let alive=true;
    async function loadDisplay(){
      if(!apiSession)return;
      try{
        const rows=await apiFetch(`/queue/display?display_mode=${displayMode}`,apiSession);
        if(alive)setDisplayRows(rows);
      }catch{
        if(alive)setDisplayRows([]);
      }
    }
    loadDisplay();
    return()=>{alive=false};
  },[apiSession?.token,apiSession?.tenantId,displayMode,scopedAppointments.length]);

  function updateAppointment(id: string, patch: any) {
    setAppointments(appointments.map((a: any) => (a.id === id ? {...a, ...patch} : a)));
  }

  async function transition(appointment: any, action: QueueAction) {
    setBusyId(appointment.id);
    setMessage('');

    try {
      if (apiSession && appointment.queueEntryId) {
        const endpoint =
          action === 'call'
            ? `/queue/${appointment.queueEntryId}/call`
            : action === 'skip'
              ? `/queue/${appointment.queueEntryId}/mark-not-available`
              : action === 'requeue'
                ? `/queue/${appointment.queueEntryId}/requeue`
                : `/queue/${appointment.queueEntryId}/cancel`;
        const body =
          action === 'requeue'
            ? {reason: 'Updated from MedizinHub web app', place_at_end: false}
            : {reason: 'Updated from MedizinHub web app'};

        await apiFetch(endpoint, apiSession, {method: 'POST', body: JSON.stringify(body)});
        await loadLiveData(apiSession);
        setMessage(`Token ${appointment.token} updated in backend.`);
      } else {
        if (action === 'call') updateAppointment(appointment.id, {queueStatus: 'Called', status: 'Scheduled'});
        if (action === 'skip') {
          updateAppointment(appointment.id, {queueStatus: 'Not Available', status: 'Skipped'});
        }
        if (action === 'requeue') {
          updateAppointment(appointment.id, {queueStatus: 'Requeued', status: 'Scheduled', priority: 2});
        }
        if (action === 'cancel') {
          updateAppointment(appointment.id, {queueStatus: 'Cancelled', status: 'Cancelled'});
        }
      }
    } catch (err: any) {
      setMessage(err.message || 'Queue update failed.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div>
          <h3 className="text-lg font-bold">Patient Queue & Token Priority</h3>
          <p className="text-sm text-slate-500">
            {apiSession
              ? 'Queue actions are saved to backend and audited. Token display supports reception and called-token modes.'
              : 'Emergency tokens appear first. Skipped patients can be requeued.'}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Display Mode">
            <Select value={displayMode} onChange={(e:any)=>setDisplayMode(e.target.value)}>
              <option value="reception">Reception Queue</option>
              <option value="called_only">Called Tokens</option>
            </Select>
          </Field>
          <Field label="Call Language">
            <Select value={tokenLanguage} onChange={(e:any)=>setTokenLanguage(e.target.value)}>
              <option value="english">English</option>
              <option value="tamil">Tamil</option>
              <option value="both">English + Tamil</option>
            </Select>
          </Field>
        </div>
      </div>
      {message && <div className="mt-4 rounded-2xl bg-blue-50 p-3 text-sm font-semibold text-blue-700">{message}</div>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(displayRows.length?displayRows:visibleQueue.slice(0,4)).map((item:any)=>(
          <div key={item.id} className="rounded-2xl bg-slate-900 p-4 text-white">
            <p className="text-xs font-bold uppercase text-slate-300">{item.priority||item.tokenType||'normal'}</p>
            <p className="mt-1 text-3xl font-black">{item.token_number||item.token}</p>
            <p className="mt-1 text-sm text-slate-300">{item.display_text||item.patient}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 overflow-auto rounded-2xl border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="p-3">Token</th>
              <th>Patient</th>
              <th>Doctor</th>
              <th>Status</th>
              <th>Queue</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleQueue.map((appointment: any) => (
              <tr key={appointment.id} className="border-t">
                <td className="p-3 font-bold">{appointment.token}</td>
                <td>{appointment.patient}</td>
                <td>{appointment.doctor}</td>
                <td>
                  <Badge>{appointment.status}</Badge>
                </td>
                <td>
                  <Badge tone={appointment.tokenType === 'Emergency' ? 'red' : 'slate'}>{appointment.queueStatus}</Badge>
                </td>
                <td className="space-x-2">
                  <button
                    disabled={busyId === appointment.id}
                    onClick={() => {
                      const tamil=`Token ${appointment.token}, maruththuva aalosanai araikku varavum.`;
                      const english=`Token ${appointment.token}, please proceed for consultation.`;
                      setMessage(tokenLanguage==='tamil'?tamil:tokenLanguage==='both'?`${english} ${tamil}`:english);
                      transition(appointment, 'call');
                    }}
                    className="rounded-2xl border px-5 py-3 font-bold disabled:text-slate-300"
                  >
                    Call
                  </button>
                  <button
                    disabled={busyId === appointment.id}
                    onClick={() => transition(appointment, 'skip')}
                    className="rounded-2xl border px-5 py-3 font-bold disabled:text-slate-300"
                  >
                    Skip
                  </button>
                  <button
                    disabled={busyId === appointment.id}
                    onClick={() => transition(appointment, 'requeue')}
                    className="rounded-2xl bg-slate-900 px-5 py-3 font-bold text-white disabled:bg-slate-300"
                  >
                    Requeue
                  </button>
                  <button
                    disabled={busyId === appointment.id}
                    onClick={() => transition(appointment, 'cancel')}
                    className="rounded-2xl border px-5 py-3 font-bold text-red-600 disabled:text-slate-300"
                  >
                    Cancel
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
