'use client';

import {useEffect,useMemo,useState} from 'react';
import {Badge,Button,Card,Field,Input,Select} from '@/components/ui';
import {apiFetch} from '@/lib/api';

type View='list'|'op'|'ip'|'equipment'|'detail';
const modalities=[
  ['ift','IFT / Interferential Therapy'],
  ['ultrasound','Ultrasound Therapy'],
  ['tens','TENS Pain Relief'],
  ['laser','Laser Therapy'],
  ['swd','Shortwave Diathermy'],
  ['cpm','CPM Joint Rehabilitation'],
  ['muscle_stimulator','Muscle Stimulator / EMS'],
  ['exercise','Therapeutic Exercise'],
];

function today(){return new Date().toISOString().slice(0,10)}
function patientName(p:any){return p?.name||p?.full_name||p?.patient_name||p?.id||'Patient'}
function inr(value:any){return `Rs. ${Number(value||0).toLocaleString('en-IN')}`}

export function Physiotherapy({branchId,departmentId,patients,appointments=[],ipAdmissions=[],apiSession,loadLiveData}:any){
  const [view,setView]=useState<View>('list');
  const [cases,setCases]=useState<any[]>([]);
  const [equipment,setEquipment]=useState<any[]>([]);
  const [sessions,setSessions]=useState<any[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const patientMap=useMemo(()=>new Map(patients.map((p:any)=>[p.id,p])),[patients]);
  const selected=cases.find((row)=>row.id===selectedId)||cases[0];
  const opAppointments=appointments.filter((row:any)=>row.patientId||row.patient_id);

  useEffect(()=>{loadPhysio()},[apiSession?.token,apiSession?.tenantId]);
  useEffect(()=>{if(selected?.id)loadSessions(selected.id)},[selected?.id]);
  useEffect(()=>{if(!selectedId&&cases[0]?.id)setSelectedId(cases[0].id)},[cases,selectedId]);

  async function loadPhysio(){
    if(!apiSession)return;
    setError('');
    try{
      const [caseRows,equipmentRows]=await Promise.all([
        apiFetch('/physiotherapy/cases',apiSession),
        apiFetch('/physiotherapy/equipment',apiSession),
      ]);
      setCases(caseRows);
      setEquipment(equipmentRows);
    }catch(err:any){
      setError(err.message||'Unable to load physiotherapy module.');
    }
  }

  async function loadSessions(caseId:string){
    if(!apiSession)return;
    try{setSessions(await apiFetch(`/physiotherapy/cases/${caseId}/sessions`,apiSession));}
    catch(err:any){setError(err.message||'Unable to load physiotherapy sessions.');}
  }

  async function refresh(){
    await loadPhysio();
    if(apiSession&&loadLiveData) await loadLiveData(apiSession);
  }

  async function submitCase(e:any,careContext:'op'|'ip'){
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    const appointmentId=String(fd.get('source_appointment_id')||'');
    const admissionId=String(fd.get('ip_admission_id')||'');
    const appointment=appointments.find((row:any)=>row.id===appointmentId);
    const admission=ipAdmissions.find((row:any)=>row.id===admissionId);
    const patientId=String(fd.get('patient_id')||appointment?.patientId||appointment?.patient_id||admission?.patient_id||admission?.patientId||'');
    const payload={
      branch_id: branchId,
      patient_id: patientId,
      source_appointment_id: appointmentId||undefined,
      ip_admission_id: admissionId||undefined,
      department_id: departmentId||undefined,
      care_context: careContext,
      assessment_date: String(fd.get('assessment_date')||today()),
      body_region: String(fd.get('body_region')||'')||undefined,
      condition: String(fd.get('condition')||'')||undefined,
      pain_score: fd.get('pain_score')===''?undefined:Number(fd.get('pain_score')),
      range_of_motion: String(fd.get('range_of_motion')||'')||undefined,
      muscle_strength: String(fd.get('muscle_strength')||'')||undefined,
      treatment_goal: String(fd.get('treatment_goal')||'')||undefined,
      planned_sessions: Number(fd.get('planned_sessions')||1),
      frequency: String(fd.get('frequency')||'')||undefined,
    };
    setBusy('case');setError('');setMessage('');
    try{
      const row=await apiFetch('/physiotherapy/cases',apiSession,{method:'POST',body:JSON.stringify(payload)});
      await refresh();
      setSelectedId(row.id);
      setView('detail');
      setMessage('Physiotherapy case created successfully.');
      e.currentTarget.reset();
    }catch(err:any){setError(err.message||'Unable to create physiotherapy case.');}
    finally{setBusy('')}
  }

  async function submitEquipment(e:any){
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    const payload={
      branch_id: String(fd.get('branch_scope')||'branch')==='branch'?branchId:undefined,
      name:String(fd.get('name')||''),
      modality_type:String(fd.get('modality_type')||'ift'),
      manufacturer:String(fd.get('manufacturer')||'')||undefined,
      model_number:String(fd.get('model_number')||'')||undefined,
      serial_number:String(fd.get('serial_number')||'')||undefined,
      is_portable:String(fd.get('is_portable')||'false')==='true',
    };
    setBusy('equipment');setError('');setMessage('');
    try{
      await apiFetch('/physiotherapy/equipment',apiSession,{method:'POST',body:JSON.stringify(payload)});
      await refresh();
      setMessage('Physiotherapy equipment saved.');
      e.currentTarget.reset();
    }catch(err:any){setError(err.message||'Unable to save equipment.');}
    finally{setBusy('')}
  }

  async function submitSession(e:any){
    e.preventDefault();
    if(!selected)return;
    const fd=new FormData(e.currentTarget);
    const payload={
      session_date:String(fd.get('session_date')||today()),
      equipment_id:String(fd.get('equipment_id')||'')||undefined,
      modality_type:String(fd.get('modality_type')||'exercise'),
      treatment_area:String(fd.get('treatment_area')||'')||undefined,
      intensity:String(fd.get('intensity')||'')||undefined,
      duration_minutes:Number(fd.get('duration_minutes')||15),
      pre_pain_score:fd.get('pre_pain_score')===''?undefined:Number(fd.get('pre_pain_score')),
      post_pain_score:fd.get('post_pain_score')===''?undefined:Number(fd.get('post_pain_score')),
      exercises:String(fd.get('exercises')||'')||undefined,
      home_program:String(fd.get('home_program')||'')||undefined,
      notes:String(fd.get('notes')||'')||undefined,
      charge_amount:Number(fd.get('charge_amount')||0),
    };
    setBusy('session');setError('');setMessage('');
    try{
      await apiFetch(`/physiotherapy/cases/${selected.id}/sessions`,apiSession,{method:'POST',body:JSON.stringify(payload)});
      await loadSessions(selected.id);
      setMessage('Physiotherapy session saved.');
      e.currentTarget.reset();
    }catch(err:any){setError(err.message||'Unable to save physiotherapy session.');}
    finally{setBusy('')}
  }

  async function generateInvoice(){
    if(!selected)return;
    setBusy('invoice');setError('');setMessage('');
    try{
      const detail=await apiFetch(`/physiotherapy/cases/${selected.id}/invoice`,apiSession,{method:'POST'});
      setMessage(`Physiotherapy invoice ${detail.invoice.invoice_number} generated for ${inr(detail.invoice.total_amount)}.`);
      await refresh();
    }catch(err:any){setError(err.message||'Unable to generate physiotherapy invoice.');}
    finally{setBusy('')}
  }

  return (
    <div className="space-y-6">
      <Header view={view} setView={setView}/>
      {message&&<div className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</div>}
      {error&&<div className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

      {view==='op'&&<CaseForm title="OP Physiotherapy Case" subtitle="Assessment, pain mapping, electrotherapy plan, and rehab exercise plan for outpatients." patients={patients} appointments={opAppointments} onSubmit={(e:any)=>submitCase(e,'op')} busy={busy==='case'} onCancel={()=>setView('list')}/>}
      {view==='ip'&&<IPCaseForm admissions={ipAdmissions} patientMap={patientMap} onSubmit={(e:any)=>submitCase(e,'ip')} busy={busy==='case'} onCancel={()=>setView('list')}/>}
      {view==='equipment'&&<EquipmentPage equipment={equipment} onSubmit={submitEquipment} busy={busy==='equipment'}/>}
      {(view==='list'||view==='detail')&&(
        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <Card>
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-lg font-bold">Physiotherapy Cases</h4>
              <Badge tone="blue">{cases.length} active</Badge>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <button type="button" onClick={()=>setView('op')} className="rounded-2xl bg-slate-900 p-4 text-left text-white"><b>New OP Physio</b><p className="mt-1 text-sm text-slate-300">Pain, sports injury, arthritis, outpatient rehab.</p></button>
              <button type="button" onClick={()=>setView('ip')} className="rounded-2xl border border-slate-200 bg-white p-4 text-left"><b>New IP Bedside Physio</b><p className="mt-1 text-sm text-slate-500">Post-surgery, bedridden, acute rehab.</p></button>
            </div>
            <div className="mt-4 grid gap-3">
              {cases.length===0&&<p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No physiotherapy cases yet.</p>}
              {cases.map((row:any)=>{
                const patient=patientMap.get(row.patient_id);
                const active=selected?.id===row.id;
                return <button key={row.id} type="button" onClick={()=>{setSelectedId(row.id);setView('detail')}} className={`rounded-2xl p-4 text-left ${active?'bg-slate-900 text-white':'bg-slate-50'}`}><b>{patientName(patient)}</b><p className={`text-sm ${active?'text-slate-300':'text-slate-500'}`}>{row.case_number} · {row.care_context?.toUpperCase()} · {row.body_region||'Assessment'}</p><p className="mt-2 text-xs font-bold uppercase">{row.status}</p></button>
              })}
            </div>
          </Card>
          <Card>
            <h4 className="text-lg font-bold">Case Summary</h4>
            {selected?(
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Info title="Patient" value={patientName(patientMap.get(selected.patient_id))}/>
                  <Info title="Pain Score" value={selected.pain_score??'-'}/>
                  <Info title="Plan" value={`${selected.planned_sessions} sessions`}/>
                </div>
                <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">{selected.treatment_goal||'No treatment goal recorded.'}</p>
              </>
            ):<p className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Select a case to manage sessions and billing.</p>}
          </Card>
        </div>
      )}

      {selected&&view==='detail'&&(
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <h4 className="text-lg font-bold">Record Therapy Session</h4>
            <form onSubmit={submitSession} className="mt-4 grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Date"><Input name="session_date" type="date" defaultValue={today()}/></Field>
                <Field label="Modality"><Select name="modality_type">{modalities.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field>
              </div>
              <Field label="Equipment"><Select name="equipment_id"><option value="">Manual / No equipment</option>{equipment.map((row:any)=><option key={row.id} value={row.id}>{row.name} · {row.modality_type}</option>)}</Select></Field>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Treatment Area"><Input name="treatment_area" defaultValue={selected.body_region||''}/></Field>
                <Field label="Intensity"><Input name="intensity" placeholder="Low / 1 MHz / 20 mA"/></Field>
                <Field label="Duration Minutes"><Input name="duration_minutes" type="number" min="1" defaultValue="20"/></Field>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Pre Pain"><Input name="pre_pain_score" type="number" min="0" max="10"/></Field>
                <Field label="Post Pain"><Input name="post_pain_score" type="number" min="0" max="10"/></Field>
                <Field label="Charge"><Input name="charge_amount" type="number" min="0" defaultValue="0"/></Field>
              </div>
              <Field label="Exercises"><Input name="exercises" placeholder="ROM, strengthening, gait training, resistance band"/></Field>
              <Field label="Home Program"><Input name="home_program" placeholder="Home exercise and device usage advice"/></Field>
              <Field label="Notes"><Input name="notes" placeholder="Response, tolerance, precautions"/></Field>
              <Button disabled={busy==='session'}>Save Session</Button>
            </form>
          </Card>
          <Card>
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-lg font-bold">Progress and Billing</h4>
              <Badge tone="green">{sessions.length} sessions</Badge>
            </div>
            <div className="mt-4 grid gap-3">
              {sessions.map((row:any)=><div key={row.id} className="rounded-2xl bg-slate-50 p-4 text-sm"><b>Session {row.session_number} · {row.modality_type}</b><p className="text-slate-500">{row.session_date} · {row.duration_minutes} mins · Pain {row.pre_pain_score??'-'} to {row.post_pain_score??'-'}</p><p className="mt-1 font-bold">{inr(row.charge_amount)}</p></div>)}
              {sessions.length===0&&<p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No sessions recorded yet.</p>}
            </div>
            <Button type="button" onClick={generateInvoice} disabled={!sessions.some((row:any)=>Number(row.charge_amount)>0)||busy==='invoice'} className="mt-4 w-full">Generate Physiotherapy Invoice</Button>
          </Card>
        </div>
      )}
    </div>
  );
}

function Header({view,setView}:any){
  return <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h3 className="text-2xl font-bold">Physiotherapy</h3><p className="text-sm text-slate-500">OP/IP assessment, electrotherapy, rehab sessions, equipment usage, progress, and billing.</p></div><div className="grid gap-2 sm:grid-cols-4"><Tab active={view==='list'||view==='detail'} onClick={()=>setView('list')}>Cases</Tab><Tab active={view==='op'} onClick={()=>setView('op')}>OP Case</Tab><Tab active={view==='ip'} onClick={()=>setView('ip')}>IP Case</Tab><Tab active={view==='equipment'} onClick={()=>setView('equipment')}>Equipment</Tab></div></div>
}
function Tab({active,onClick,children}:any){return <button type="button" onClick={onClick} className={`rounded-2xl px-4 py-3 text-sm font-bold ${active?'bg-slate-900 text-white':'border border-slate-200 bg-white text-slate-700'}`}>{children}</button>}
function Info({title,value}:any){return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">{title}</p><p className="mt-1 break-words text-lg font-bold">{value}</p></div>}

function CaseFields(){
  return <>
    <div className="grid gap-3 md:grid-cols-3">
      <Field label="Body Region"><Input name="body_region" placeholder="Knee, shoulder, lumbar spine"/></Field>
      <Field label="Pain Score"><Input name="pain_score" type="number" min="0" max="10"/></Field>
      <Field label="Assessment Date"><Input name="assessment_date" type="date" defaultValue={today()}/></Field>
    </div>
    <Field label="Condition"><Input name="condition" placeholder="Chronic pain, post-surgery, sports injury, arthritis"/></Field>
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Range Of Motion"><Input name="range_of_motion"/></Field>
      <Field label="Muscle Strength"><Input name="muscle_strength"/></Field>
    </div>
    <Field label="Treatment Goal"><Input name="treatment_goal" placeholder="Pain relief, mobility, strengthening, joint rehabilitation"/></Field>
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Planned Sessions"><Input name="planned_sessions" type="number" min="1" defaultValue="6"/></Field>
      <Field label="Frequency"><Input name="frequency" placeholder="Daily / 3 days per week"/></Field>
    </div>
  </>
}

function CaseForm({title,subtitle,patients,appointments,onSubmit,busy,onCancel}:any){
  return <Card><div><h4 className="text-xl font-bold">{title}</h4><p className="text-sm text-slate-500">{subtitle}</p></div><form onSubmit={onSubmit} className="mt-5 grid gap-4"><Field label="Patient"><Select name="patient_id" required><option value="">Select patient</option>{patients.map((p:any)=><option key={p.id} value={p.id}>{patientName(p)} · {p.mobile||p.patientNumber||p.id}</option>)}</Select></Field><Field label="Linked OP Appointment"><Select name="source_appointment_id"><option value="">No linked appointment</option>{appointments.map((a:any)=><option key={a.id} value={a.id}>{a.patient} · {a.appointmentDate} · {a.doctor}</option>)}</Select></Field><CaseFields/><div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} className="rounded-2xl border px-5 py-3 text-sm font-bold">Cancel</button><Button disabled={busy}>Create OP Physio Case</Button></div></form></Card>
}

function IPCaseForm({admissions,patientMap,onSubmit,busy,onCancel}:any){
  return <Card><div><h4 className="text-xl font-bold">IP Bedside Physiotherapy Case</h4><p className="text-sm text-slate-500">Use this for post-surgical rehab, bedridden patients, acute injury management, CPM, gait training, tilt table, and EMS workflows.</p></div><form onSubmit={onSubmit} className="mt-5 grid gap-4"><Field label="IP Admission"><Select name="ip_admission_id" required><option value="">Select IP admission</option>{admissions.map((row:any)=><option key={row.id} value={row.id}>{patientName(patientMap.get(row.patient_id||row.patientId))} · {row.admission_number||row.id} · Bed {row.bed}</option>)}</Select></Field>{admissions.length===0&&<div className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-700">No IP admissions are loaded. Create or convert an IP admission first.</div>}<CaseFields/><div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} className="rounded-2xl border px-5 py-3 text-sm font-bold">Cancel</button><Button disabled={busy}>Create IP Physio Case</Button></div></form></Card>
}

function EquipmentPage({equipment,onSubmit,busy}:any){
  return <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]"><Card><h4 className="text-lg font-bold">Add Equipment</h4><form onSubmit={onSubmit} className="mt-4 grid gap-3"><Field label="Name"><Input name="name" placeholder="HMS Indotherm 500W" required/></Field><Field label="Modality"><Select name="modality_type">{modalities.map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field><div className="grid gap-3 md:grid-cols-2"><Field label="Manufacturer"><Input name="manufacturer" placeholder="HMS"/></Field><Field label="Model"><Input name="model_number" placeholder="DIGISTIM 202"/></Field></div><div className="grid gap-3 md:grid-cols-2"><Field label="Serial Number"><Input name="serial_number"/></Field><Field label="Portable"><Select name="is_portable"><option value="false">No</option><option value="true">Yes</option></Select></Field></div><Field label="Scope"><Select name="branch_scope"><option value="branch">Current Branch</option><option value="tenant">All Branches</option></Select></Field><Button disabled={busy}>Save Equipment</Button></form></Card><Card><h4 className="text-lg font-bold">Equipment Catalog</h4><div className="mt-4 grid gap-3">{equipment.length===0&&<p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No equipment saved yet.</p>}{equipment.map((row:any)=><div key={row.id} className="rounded-2xl bg-slate-50 p-4"><b>{row.name}</b><p className="text-sm text-slate-500">{row.modality_type} · {row.is_portable?'Portable':'Fixed'} · {row.model_number||'No model'}</p></div>)}</div></Card></div>
}
