'use client';

import {useEffect,useMemo,useState} from 'react';
import {Badge,Button,Card,Field,Input,Select} from '@/components/ui';
import {apiFetch} from '@/lib/api';

function today(){return new Date().toISOString().slice(0,10)}
function patientName(p:any){return p?.name||p?.full_name||p?.patient_name||p?.id||'Patient'}
function admissionLabel(row:any){return `${row.admission_number||row.id} · ${row.ward||'Ward'} · Bed ${row.bed||'-'}`}
function inr(value:any){return `Rs. ${Number(value||0).toLocaleString('en-IN')}`}
type IPView='list'|'convert'|'direct'|'detail';

export function IPAdmission({
  branchId,
  departmentId,
  patients,
  appointments=[],
  ipAdmissions,
  setIpAdmissions,
  apiSession,
  loadLiveData,
}:any){
  const [selectedId,setSelectedId]=useState('');
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [treatments,setTreatments]=useState<any[]>([]);
  const [charges,setCharges]=useState<any[]>([]);
  const [latestConsultation,setLatestConsultation]=useState<any>(null);
  const [latestConsent,setLatestConsent]=useState<any>(null);
  const [latestDischarge,setLatestDischarge]=useState<any>(null);
  const [view,setView]=useState<IPView>('list');

  const selectedAdmission=ipAdmissions.find((row:any)=>row.id===selectedId)||ipAdmissions[0];
  const patientMap=useMemo(()=>new Map(patients.map((p:any)=>[p.id,p])),[patients]);
  const opCandidates=appointments.filter((a:any)=>['consultation_completed','checked_in','waiting','called','in_consultation'].includes(a.status)||a.consultationStatus==='signed');

  useEffect(()=>{if(!selectedId&&ipAdmissions[0]?.id)setSelectedId(ipAdmissions[0].id)},[ipAdmissions,selectedId]);
  useEffect(()=>{if(selectedAdmission?.id)loadAdmissionWork(selectedAdmission.id)},[selectedAdmission?.id]);

  async function refresh(){
    if(apiSession&&loadLiveData) await loadLiveData(apiSession);
  }

  async function loadAdmissionWork(admissionId:string){
    if(!apiSession)return;
    setError('');
    try{
      const [treatmentRows,chargeRows]=await Promise.all([
        apiFetch(`/ip/admissions/${admissionId}/treatments`,apiSession),
        apiFetch(`/ip/admissions/${admissionId}/charges`,apiSession),
      ]);
      setTreatments(treatmentRows);
      setCharges(chargeRows);
    }catch(err:any){
      setError(err.message||'Unable to load IP admission details.');
    }
  }

  async function submitAdmission(e:any,fromAppointment=false){
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    const sourceAppointmentId=String(fd.get('source_appointment_id')||'');
    const patientId=String(fd.get('patient_id')||'');
    const payload={
      branch_id: branchId,
      patient_id: patientId,
      source_appointment_id: sourceAppointmentId||undefined,
      department_id: String(fd.get('department_id')||departmentId||'')||undefined,
      admitting_practitioner_id: String(fd.get('practitioner_id')||'')||undefined,
      ward: String(fd.get('ward')||'General Ward'),
      room: String(fd.get('room')||'')||undefined,
      bed: String(fd.get('bed')||''),
      admission_date: String(fd.get('admission_date')||today()),
      reason: String(fd.get('reason')||'')||undefined,
      provisional_diagnosis: String(fd.get('provisional_diagnosis')||'')||undefined,
    };
    setBusy('admission');setError('');setMessage('');
    try{
      if(apiSession){
        const path=fromAppointment&&sourceAppointmentId?`/ip/admissions/from-appointment/${sourceAppointmentId}`:'/ip/admissions';
        const row=await apiFetch(path,apiSession,{method:'POST',body:JSON.stringify(payload)});
        await refresh();
        setSelectedId(row.id);
        setView('detail');
        setMessage('IP admission created successfully.');
      }else{
        const p=patients.find((row:any)=>row.id===patientId);
        const row={...payload,id:`IP-${1001+ipAdmissions.length}`,admission_number:`IP-${1001+ipAdmissions.length}`,patient_id:patientId,status:'admitted',patient:patientName(p)};
        setIpAdmissions([row,...ipAdmissions]);
        setSelectedId(row.id);
        setView('detail');
      }
      e.currentTarget.reset();
    }catch(err:any){setError(err.message||'Unable to create IP admission.')}
    finally{setBusy('')}
  }

  async function postWork(e:any,type:'treatment'|'consultation'|'consent'|'discharge'|'charge'){
    e.preventDefault();
    if(!selectedAdmission)return;
    const fd=new FormData(e.currentTarget);
    const bodies:any={
      treatment:{
        treatment_date:String(fd.get('treatment_date')||today()),
        practitioner_id:String(fd.get('practitioner_id')||'')||undefined,
        treatment_type:String(fd.get('treatment_type')||'ward_round'),
        notes:String(fd.get('notes')||''),
        medication_summary:String(fd.get('medication_summary')||'')||undefined,
        orders:String(fd.get('orders')||'')||undefined,
      },
      consultation:{
        practitioner_id:String(fd.get('practitioner_id')||'')||undefined,
        consultation_date:String(fd.get('consultation_date')||today()),
        vitals_json:JSON.stringify({bp:String(fd.get('bp')||''),pulse:String(fd.get('pulse')||''),temperature:String(fd.get('temperature')||'')}),
        complaints:String(fd.get('complaints')||'')||undefined,
        diagnosis:String(fd.get('diagnosis')||'')||undefined,
        notes:String(fd.get('notes')||'')||undefined,
        prescription_text:String(fd.get('prescription_text')||'')||undefined,
      },
      consent:{
        consent_type:String(fd.get('consent_type')||'general_admission'),
        title:String(fd.get('title')||'General IP Admission Consent'),
        content:String(fd.get('content')||'')||'Patient/guardian consent received for in-patient admission and treatment.',
        patient_or_guardian_name:String(fd.get('patient_or_guardian_name')||'')||undefined,
        relationship:String(fd.get('relationship')||'')||undefined,
      },
      discharge:{
        discharge_date:String(fd.get('discharge_date')||today()),
        final_diagnosis:String(fd.get('final_diagnosis')||''),
        course_in_hospital:String(fd.get('course_in_hospital')||'')||undefined,
        procedures:String(fd.get('procedures')||'')||undefined,
        medications:String(fd.get('medications')||'')||undefined,
        follow_up_advice:String(fd.get('follow_up_advice')||'')||undefined,
        condition_at_discharge:String(fd.get('condition_at_discharge')||'')||undefined,
      },
      charge:{
        charge_type:String(fd.get('charge_type')||'room'),
        description:String(fd.get('description')||''),
        quantity:Number(fd.get('quantity')||1),
        unit_amount:Number(fd.get('unit_amount')||0),
      },
    };
    const paths:any={
      treatment:`/ip/admissions/${selectedAdmission.id}/treatments`,
      consultation:`/ip/admissions/${selectedAdmission.id}/consultations`,
      consent:`/ip/admissions/${selectedAdmission.id}/consents`,
      discharge:`/ip/admissions/${selectedAdmission.id}/discharge-summary`,
      charge:`/ip/admissions/${selectedAdmission.id}/charges`,
    };
    setBusy(type);setError('');setMessage('');
    try{
      if(!apiSession)throw new Error('Backend login is required for IP workflow actions.');
      const row=await apiFetch(paths[type],apiSession,{method:'POST',body:JSON.stringify(bodies[type])});
      if(type==='consultation')setLatestConsultation(row);
      if(type==='consent')setLatestConsent(row);
      if(type==='discharge')setLatestDischarge(row);
      await loadAdmissionWork(selectedAdmission.id);
      await refresh();
      setMessage(`${type.replace('_',' ')} saved successfully.`);
      e.currentTarget.reset();
    }catch(err:any){setError(err.message||`Unable to save ${type}.`)}
    finally{setBusy('')}
  }

  async function sign(path:string,label:string,setter:(row:any)=>void){
    setBusy(label);setError('');setMessage('');
    try{
      const row=await apiFetch(path,apiSession,{method:'POST'});
      setter(row);
      setMessage(`${label} completed.`);
      await refresh();
    }catch(err:any){setError(err.message||`Unable to complete ${label}.`)}
    finally{setBusy('')}
  }

  async function generateInvoice(){
    if(!selectedAdmission||!apiSession)return;
    setBusy('invoice');setError('');setMessage('');
    try{
      const detail=await apiFetch(`/ip/admissions/${selectedAdmission.id}/invoice`,apiSession,{method:'POST'});
      setMessage(`IP invoice ${detail.invoice.invoice_number} generated for ${inr(detail.invoice.total_amount)}.`);
      await refresh();
    }catch(err:any){setError(err.message||'Unable to generate IP invoice.')}
    finally{setBusy('')}
  }

  if(view==='convert'){
    return (
      <div className="space-y-6">
        <IPHeader view={view} setView={setView}/>
        {message&&<div className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</div>}
        {error&&<div className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
        <Card>
          <div className="flex flex-col gap-2">
            <h4 className="text-xl font-bold">Convert OP to IP</h4>
            <p className="text-sm text-slate-500">Use this when an OP patient requires admission after doctor consultation or clinical review.</p>
          </div>
          <form onSubmit={(e)=>submitAdmission(e,true)} className="mt-5 grid gap-4">
            <Field label="OP Appointment">
              <Select name="source_appointment_id" required className="min-h-[52px]">
                <option value="">Select appointment</option>
                {opCandidates.map((a:any)=><option key={a.id} value={a.id}>{a.patient} · {a.appointmentDate} · {a.doctor}</option>)}
              </Select>
            </Field>
            {opCandidates.length===0&&<div className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-700">No eligible OP appointments are currently loaded for conversion.</div>}
            <AdmissionFields patients={patients} departmentId={departmentId} hidePatient/>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={()=>setView('list')} className="rounded-2xl border px-5 py-3 text-sm font-bold">Cancel</button>
              <Button disabled={busy==='admission'}>Create IP Admission</Button>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  if(view==='direct'){
    return (
      <div className="space-y-6">
        <IPHeader view={view} setView={setView}/>
        {message&&<div className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</div>}
        {error&&<div className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}
        <Card>
          <div className="flex flex-col gap-2">
            <h4 className="text-xl font-bold">Direct IP Admission</h4>
            <p className="text-sm text-slate-500">Use this for direct admission, emergency admission, or referred IP cases without an OP appointment.</p>
          </div>
          <form onSubmit={(e)=>submitAdmission(e,false)} className="mt-5 grid gap-4">
            <AdmissionFields patients={patients} departmentId={departmentId}/>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={()=>setView('list')} className="rounded-2xl border px-5 py-3 text-sm font-bold">Cancel</button>
              <Button disabled={busy==='admission'}>Admit Patient</Button>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <IPHeader view={view} setView={setView}/>
      {message&&<div className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{message}</div>}
      {error&&<div className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-lg font-bold">Current IP Admissions</h4>
            <Badge tone="blue">{ipAdmissions.length} active</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <button type="button" onClick={()=>setView('convert')} className="rounded-2xl bg-slate-900 p-4 text-left text-white">
              <div className="font-bold">Convert OP to IP</div>
              <div className="mt-1 text-sm text-slate-300">Admit from existing OP appointment.</div>
            </button>
            <button type="button" onClick={()=>setView('direct')} className="rounded-2xl border border-slate-200 bg-white p-4 text-left">
              <div className="font-bold">Direct IP Admission</div>
              <div className="mt-1 text-sm text-slate-500">Emergency, referral, or direct admission.</div>
            </button>
          </div>
          <div className="mt-4 grid gap-3">
            {ipAdmissions.length===0&&<p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No IP admissions yet.</p>}
            {ipAdmissions.map((row:any)=>{
              const p=patientMap.get(row.patient_id)||patientMap.get(row.patientId);
              return (
                <button key={row.id} type="button" onClick={()=>{setSelectedId(row.id);setView('detail')}} className={`rounded-2xl p-4 text-left ${selectedAdmission?.id===row.id?'bg-slate-900 text-white':'bg-slate-50 text-slate-900'}`}>
                  <div className="font-bold">{patientName(p)||row.patient||row.patient_id}</div>
                  <div className={`text-sm ${selectedAdmission?.id===row.id?'text-slate-300':'text-slate-500'}`}>{admissionLabel(row)}</div>
                  <div className="mt-2 text-xs font-bold uppercase">{row.status}</div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <h4 className="text-lg font-bold">IP Workflow</h4>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Info title="Admission" value={selectedAdmission?admissionLabel(selectedAdmission):'No admission selected'}/>
            <Info title="Treatments" value={treatments.length}/>
            <Info title="Charges" value={inr(charges.reduce((sum,row)=>sum+Number(row.total_amount||0),0))}/>
          </div>
          <p className="mt-4 text-sm text-slate-500">Select an IP admission from the left to manage treatment, consultation, consent, discharge, and billing.</p>
        </Card>
      </div>

      {selectedAdmission&&(
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <h4 className="text-lg font-bold">Treatment Notes</h4>
            <form onSubmit={(e)=>postWork(e,'treatment')} className="mt-4 grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Date"><Input name="treatment_date" type="date" defaultValue={today()}/></Field>
                <Field label="Type"><Select name="treatment_type"><option value="ward_round">Ward Round</option><option value="procedure">Procedure</option><option value="nursing">Nursing Note</option><option value="medication">Medication</option></Select></Field>
              </div>
              <Field label="Treatment Notes"><Input name="notes" required placeholder="Clinical progress, care plan, response"/></Field>
              <Field label="Medication Summary"><Input name="medication_summary" placeholder="IV fluids, injections, medicines"/></Field>
              <Field label="Orders"><Input name="orders" placeholder="Lab, scan, diet, monitoring orders"/></Field>
              <Button disabled={busy==='treatment'}>Save Treatment</Button>
            </form>
            <div className="mt-4 grid gap-2">
              {treatments.slice(0,4).map((row:any)=><div key={row.id} className="rounded-2xl bg-slate-50 p-3 text-sm"><b>{row.treatment_date} · {row.treatment_type}</b><p className="text-slate-500">{row.notes}</p></div>)}
            </div>
          </Card>

          <Card>
            <h4 className="text-lg font-bold">IP Doctor Consultation</h4>
            <form onSubmit={(e)=>postWork(e,'consultation')} className="mt-4 grid gap-3">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="BP"><Input name="bp" placeholder="120/80"/></Field>
                <Field label="Pulse"><Input name="pulse" placeholder="78"/></Field>
                <Field label="Temp"><Input name="temperature" placeholder="98.6 F"/></Field>
              </div>
              <Field label="Complaints"><Input name="complaints" placeholder="Current IP complaints"/></Field>
              <Field label="Diagnosis"><Input name="diagnosis" placeholder="Working diagnosis"/></Field>
              <Field label="Notes"><Input name="notes" placeholder="Assessment and care plan"/></Field>
              <Field label="Prescription"><Input name="prescription_text" placeholder="Medicine rows can be structured next"/></Field>
              <div className="flex flex-wrap gap-3">
                <Button disabled={busy==='consultation'}>Save Draft</Button>
                <Button type="button" disabled={!latestConsultation||busy==='consultation sign'} onClick={()=>sign(`/ip/consultations/${latestConsultation.id}/sign`,'consultation sign',setLatestConsultation)} className="bg-emerald-700">Sign Consultation</Button>
              </div>
            </form>
          </Card>

          <Card>
            <h4 className="text-lg font-bold">Patient Consent Form</h4>
            <form onSubmit={(e)=>postWork(e,'consent')} className="mt-4 grid gap-3">
              <Field label="Consent Type"><Select name="consent_type"><option value="general_admission">General Admission</option><option value="procedure">Procedure Consent</option><option value="anaesthesia">Anaesthesia Consent</option><option value="high_risk">High Risk Consent</option></Select></Field>
              <Field label="Title"><Input name="title" defaultValue="General IP Admission Consent"/></Field>
              <Field label="Consent Text"><Input name="content" defaultValue="Patient/guardian consent received for in-patient admission, investigation, treatment, billing, and discharge process."/></Field>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Patient / Guardian"><Input name="patient_or_guardian_name"/></Field>
                <Field label="Relationship"><Input name="relationship"/></Field>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button disabled={busy==='consent'}>Save Consent</Button>
                <Button type="button" disabled={!latestConsent||busy==='consent sign'} onClick={()=>sign(`/ip/consents/${latestConsent.id}/sign`,'consent sign',setLatestConsent)} className="bg-emerald-700">Mark Signed</Button>
              </div>
            </form>
          </Card>

          <Card>
            <h4 className="text-lg font-bold">Discharge Summary</h4>
            <form onSubmit={(e)=>postWork(e,'discharge')} className="mt-4 grid gap-3">
              <Field label="Discharge Date"><Input name="discharge_date" type="date" defaultValue={today()}/></Field>
              <Field label="Final Diagnosis"><Input name="final_diagnosis" required/></Field>
              <Field label="Course In Hospital"><Input name="course_in_hospital"/></Field>
              <Field label="Procedures"><Input name="procedures"/></Field>
              <Field label="Medications"><Input name="medications"/></Field>
              <Field label="Follow-up Advice"><Input name="follow_up_advice"/></Field>
              <Field label="Condition At Discharge"><Input name="condition_at_discharge"/></Field>
              <div className="flex flex-wrap gap-3">
                <Button disabled={busy==='discharge'}>Save Summary</Button>
                <Button type="button" disabled={!latestDischarge||busy==='discharge finalize'} onClick={()=>sign(`/ip/discharge-summaries/${latestDischarge.id}/finalize`,'discharge finalize',setLatestDischarge)} className="bg-emerald-700">Finalize Discharge</Button>
              </div>
            </form>
          </Card>

          <Card className="xl:col-span-2">
            <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
              <div>
                <h4 className="text-lg font-bold">IP Charges and Invoice</h4>
                <form onSubmit={(e)=>postWork(e,'charge')} className="mt-4 grid gap-3 md:grid-cols-5">
                  <Field label="Type"><Select name="charge_type"><option value="room">Room</option><option value="doctor">Doctor Visit</option><option value="procedure">Procedure</option><option value="nursing">Nursing</option><option value="medicine">Medicine</option><option value="lab">Lab</option></Select></Field>
                  <Field label="Description"><Input name="description" required className="md:col-span-2"/></Field>
                  <Field label="Qty"><Input name="quantity" type="number" min="1" defaultValue="1"/></Field>
                  <Field label="Amount"><Input name="unit_amount" type="number" min="0" required/></Field>
                  <Button disabled={busy==='charge'} className="md:col-span-5">Add Charge</Button>
                </form>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <h5 className="font-bold">Charge Summary</h5>
                <div className="mt-3 grid gap-2">
                  {charges.map((row:any)=><div key={row.id} className="flex justify-between gap-3 text-sm"><span>{row.description}</span><b>{inr(row.total_amount)}</b></div>)}
                  <div className="border-t pt-3 text-right text-lg font-bold">{inr(charges.reduce((sum,row)=>sum+Number(row.total_amount||0),0))}</div>
                </div>
                <Button type="button" disabled={!charges.length||busy==='invoice'} onClick={generateInvoice} className="mt-4 w-full">Generate IP Invoice</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function AdmissionFields({patients,departmentId,hidePatient=false}:any){
  return (
    <>
      {!hidePatient&&(
        <Field label="Patient">
          <Select name="patient_id" required>
            <option value="">Select patient</option>
            {patients.map((p:any)=><option key={p.id} value={p.id}>{patientName(p)} · {p.mobile||p.patientNumber||p.id}</option>)}
          </Select>
        </Field>
      )}
      <input type="hidden" name="department_id" value={departmentId||''}/>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Ward"><Select name="ward"><option>General Ward</option><option>Private Room</option><option>ICU</option><option>Emergency Ward</option></Select></Field>
        <Field label="Bed"><Input name="bed" required/></Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Room"><Input name="room"/></Field>
        <Field label="Admission Date"><Input name="admission_date" type="date" defaultValue={today()}/></Field>
      </div>
      <Field label="Reason"><Input name="reason" placeholder="Reason for IP admission"/></Field>
      <Field label="Provisional Diagnosis"><Input name="provisional_diagnosis"/></Field>
    </>
  );
}

function IPHeader({view,setView}:any){
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h3 className="text-2xl font-bold">IP Management</h3>
        <p className="text-sm text-slate-500">OP to IP conversion, direct admission, treatments, consent, discharge summary, and IP billing.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={()=>setView('list')} className={`rounded-2xl px-4 py-3 text-sm font-bold ${view==='list'||view==='detail'?'bg-slate-900 text-white':'border border-slate-200 bg-white text-slate-700'}`}>Admissions</button>
        <button type="button" onClick={()=>setView('convert')} className={`rounded-2xl px-4 py-3 text-sm font-bold ${view==='convert'?'bg-slate-900 text-white':'border border-slate-200 bg-white text-slate-700'}`}>Convert OP to IP</button>
        <button type="button" onClick={()=>setView('direct')} className={`rounded-2xl px-4 py-3 text-sm font-bold ${view==='direct'?'bg-slate-900 text-white':'border border-slate-200 bg-white text-slate-700'}`}>Direct Admission</button>
      </div>
    </div>
  );
}

function Info({title,value}:any){
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-xs font-bold uppercase text-slate-500">{title}</div>
      <div className="mt-1 break-words text-lg font-bold">{value}</div>
    </div>
  );
}
