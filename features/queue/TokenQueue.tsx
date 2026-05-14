'use client';

import {useEffect,useState} from 'react';
import {ActionButton,ActionGroup,Badge,Card,Field,Select} from '@/components/ui';
import {apiFetch,type ApiSession} from '@/lib/api';
import {sortQueue} from '@/lib/hmsLogic';

type TokenQueueProps = {
  scopedAppointments: any[];
  appointments: any[];
  setAppointments: (value: any[]) => void;
  apiSession: ApiSession | null;
  loadLiveData: (session: ApiSession) => Promise<void>;
  departmentId: string;
  doctorScope?: any;
  setActive?: (page: string) => void;
};

type QueueAction = 'call' | 'skip' | 'requeue' | 'cancel';

function tokenSortValue(row:any){
  return String(row.token_number||row.token||'').trim();
}

function sortByTokenNumber(rows:any[]){
  return [...rows].sort((a:any,b:any)=>tokenSortValue(a).localeCompare(tokenSortValue(b),undefined,{numeric:true,sensitivity:'base'}));
}

function isActiveQueueStatus(value:any){
  const status=String(value||'').trim().toLowerCase().replaceAll(' ','_');
  return !['cancelled','canceled','no_show','consultation_completed','billed','completed','done'].includes(status);
}

export function TokenQueue({
  scopedAppointments,
  appointments,
  setAppointments,
  apiSession,
  loadLiveData,
  departmentId,
  doctorScope,
  setActive,
}: TokenQueueProps) {
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');
  const [displayMode,setDisplayMode]=useState<'reception'|'called_only'>('reception');
  const [tokenLanguage,setTokenLanguage]=useState<'english'|'tamil'|'both'>('english');
  const [displayRows,setDisplayRows]=useState<any[]>([]);
  const queue = sortByTokenNumber(sortQueue(scopedAppointments.filter((appointment:any)=>{
    if(departmentId&&appointment.departmentId!==departmentId)return false;
    if(!isActiveQueueStatus(appointment.queueStatus||appointment.status))return false;
    if(doctorScope?.practitionerId){
      return appointment.doctorId===doctorScope.practitionerId||appointment.practitioner_id===doctorScope.practitionerId;
    }
    return true;
  })));
  const visibleQueue=displayMode==='called_only'?queue.filter((appointment:any)=>appointment.queueStatus==='called'||appointment.queueStatus==='Called'):queue;
  const visibleDisplayRows=sortByTokenNumber(displayRows)
    .map((row:any)=>({...row,appointment:queue.find((appointment:any)=>appointment.id===row.appointment_id)}))
    .filter((row:any)=>row.appointment);

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

  function openConsultation(appointment:any){
    if(!appointment?.id)return;
    sessionStorage.setItem('medizinhub.consultationAppointmentId',appointment.id);
    setActive?.('consultation');
  }

  function openPatient(appointment:any){
    const patientId=appointment?.patientId||appointment?.patient_id;
    if(!patientId)return;
    sessionStorage.setItem('medizinhub.patientId',patientId);
    setActive?.('patients');
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
        {(visibleDisplayRows.length?visibleDisplayRows:visibleQueue.slice(0,8)).map((item:any)=>{
          const appointment=item.appointment||item;
          return (
          <button key={item.id} type="button" onClick={()=>openConsultation(appointment)} className="rounded-2xl bg-slate-900 p-4 text-left text-white transition hover:bg-slate-800">
            <p className="text-xs font-bold uppercase text-slate-300">{item.priority||item.tokenType||'normal'}</p>
            <p className="mt-1 text-3xl font-black">{item.token_number||item.token}</p>
            <p className="mt-1 text-sm font-semibold text-white">{appointment.patient||item.patient_id}</p>
            <p className="mt-1 truncate text-xs text-slate-300">{appointment.doctor||'Doctor'} · {appointment.queueStatus||item.status}</p>
          </button>
        )})}
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
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleQueue.map((appointment: any) => (
              <tr key={appointment.id} onClick={()=>openConsultation(appointment)} className="cursor-pointer border-t transition hover:bg-slate-50">
                <td className="p-3 font-bold"><button type="button" onClick={()=>openConsultation(appointment)} className="rounded-xl border px-3 py-2 font-bold hover:bg-slate-50">{appointment.token}</button></td>
                <td><button type="button" onClick={()=>openConsultation(appointment)} className="text-left font-semibold hover:underline">{appointment.patient}</button></td>
                <td>{appointment.doctor}</td>
                <td>
                  <Badge>{appointment.status}</Badge>
                </td>
                <td>
                  <Badge tone={appointment.tokenType === 'Emergency' ? 'red' : 'slate'}>{appointment.queueStatus}</Badge>
                </td>
                <td className="px-3 py-3" onClick={(event)=>event.stopPropagation()}>
                  <ActionGroup>
                  <ActionButton onClick={() => openConsultation(appointment)}>
                    Details
                  </ActionButton>
                  <ActionButton onClick={() => openPatient(appointment)}>
                    Patient
                  </ActionButton>
                  <ActionButton
                    disabled={busyId === appointment.id}
                    onClick={() => {
                      const tamil=`Token ${appointment.token}, maruththuva aalosanai araikku varavum.`;
                      const english=`Token ${appointment.token}, please proceed for consultation.`;
                      setMessage(tokenLanguage==='tamil'?tamil:tokenLanguage==='both'?`${english} ${tamil}`:english);
                      transition(appointment, 'call');
                    }}
                  >
                    Call
                  </ActionButton>
                  <ActionButton
                    disabled={busyId === appointment.id}
                    onClick={() => transition(appointment, 'skip')}
                  >
                    Skip
                  </ActionButton>
                  <ActionButton
                    tone="primary"
                    disabled={busyId === appointment.id}
                    onClick={() => transition(appointment, 'requeue')}
                  >
                    Requeue
                  </ActionButton>
                  <ActionButton
                    tone="danger"
                    disabled={busyId === appointment.id}
                    onClick={() => transition(appointment, 'cancel')}
                  >
                    Cancel
                  </ActionButton>
                  </ActionGroup>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
