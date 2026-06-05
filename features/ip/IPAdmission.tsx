'use client';

import {useEffect,useMemo,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {Badge,Button,Card,Input,Select,StatusToast} from '@/components/common/ui';
import {FormField} from '@/components/FormElements';
import {SearchPicker,TagEntryBox,medicineFrequencyOptions,rowTagLabel} from '@/components/clinicalRows';
import {UPLOADS_BASE,apiFetch,apiUpload} from '@/lib/api';

function today(){return new Date().toISOString().slice(0,10)}
function patientName(p:any){return p?.name||p?.full_name||p?.patient_name||p?.id||'Patient'}
function admissionLabel(row:any){return `${row.admission_number||row.id} · ${row.ward||'Ward'} · Bed ${row.bed||'-'}`}
function inr(value:any){return `Rs. ${Number(value||0).toLocaleString('en-IN')}`}
function chargeableDays(start:any,end:any){const s=new Date(`${start||today()}T00:00:00`);const e=new Date(`${end||today()}T00:00:00`);if(Number.isNaN(s.getTime())||Number.isNaN(e.getTime())||e<s)return 1;return Math.max(Math.floor((e.getTime()-s.getTime())/86400000)+1,1)}
function datetimeLocal(){const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)}
function doseUnits(dosage:string){
  const normalized=String(dosage||'').toLowerCase();
  if(!/(tab|tablet|cap|capsule|sachet|vial|amp|drop|puff|spoon)/.test(normalized))return 1;
  const fraction=normalized.match(/(\d+)\s*\/\s*(\d+)/);
  if(fraction&&Number(fraction[2])>0)return Math.max(Number(fraction[1])/Number(fraction[2]),0.5);
  const match=normalized.match(/\d+(\.\d+)?/);
  return Math.max(match?Number(match[0]):1,0.5);
}
function dailyDoseQuantity(dosage:string,frequency:string){
  const normalized=String(frequency||'').trim().toLowerCase();
  const compact=normalized.replace(/[\s._]+/g,'');
  let doses=1;
  if(/^\d+(-\d+)+$/.test(compact))doses=compact.split('-').reduce((sum,part)=>sum+Number(part||0),0);
  else if(['bd','bid','twice','twiceaday','twicedaily'].includes(compact))doses=2;
  else if(['tds','tid','thrice','thriceaday','thricedaily'].includes(compact))doses=3;
  else if(['qid','qds','fourtimesaday'].includes(compact))doses=4;
  else {
    const every=normalized.match(/(?:q|every)\s*(\d+)\s*(h|hr|hour)/);
    const times=normalized.match(/(\d+)\s*(times|time|x)\s*(a|per)?\s*day/);
    if(every&&Number(every[1])>0)doses=Math.max(24/Number(every[1]),1);
    else if(times)doses=Number(times[1]);
    else {
      const numbers=[...normalized.matchAll(/\d+/g)].map((m)=>Number(m[0]));
      if(numbers.length)doses=numbers.reduce((sum,row)=>sum+row,0);
    }
  }
  return Math.max(Math.ceil(doseUnits(dosage)*Math.max(doses,1)),1);
}
function defaultRooms(branchId:string){
  return [
    ['general','General Ward','shared','GW-001','GW-001-A',800],
    ['general','General Ward','shared','GW-001','GW-001-B',800],
    ['general','General Ward','shared','GW-002','GW-002-A',800],
    ['private','Private Room','single','PR-101','PR-101',2500],
    ['private','Private Room','single','PR-102','PR-102',2500],
    ['icu','ICU','critical_care','ICU-01','ICU-01',6000],
    ['icu','ICU','critical_care','ICU-02','ICU-02',6000],
    ['emergency','Emergency Ward','observation','ER-01','ER-01-A',1500],
    ['emergency','Emergency Ward','observation','ER-01','ER-01-B',1500],
  ].map(([ward_type,ward_name,room_type,room_number,bed_number,daily_rate])=>({branch_id:branchId,ward_type,ward_name,room_type,room_number,bed_number,daily_rate}));
}
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
  const [billingItems,setBillingItems]=useState<any[]>([]);
  const [ipDocuments,setIpDocuments]=useState<any[]>([]);
  const [medicationOrders,setMedicationOrders]=useState<any[]>([]);
  const [medicationAdministrations,setMedicationAdministrations]=useState<any[]>([]);
  const [medicineCatalog,setMedicineCatalog]=useState<any[]>([]);
  const [labCatalog,setLabCatalog]=useState<any[]>([]);
  const [latestConsultation,setLatestConsultation]=useState<any>(null);
  const [latestConsent,setLatestConsent]=useState<any>(null);
  const [latestDischarge,setLatestDischarge]=useState<any>(null);
  const [ipRooms,setIpRooms]=useState<any[]>([]);
  const [roomSeedAttempted,setRoomSeedAttempted]=useState(false);
  const [ipInvoice,setIpInvoice]=useState<any>(null);
  const [admissionDate,setAdmissionDate]=useState(today());
  const [expectedDischargeDate,setExpectedDischargeDate]=useState(today());
  const [view,setView]=useState<IPView>('list');
  const [admissionPage,setAdmissionPage]=useState(1);
  const [admissionFilter,setAdmissionFilter]=useState<'active'|'completed'|'all'>('active');

  const patientMap=useMemo(()=>new Map(patients.map((p:any)=>[p.id,p])),[patients]);
  const opCandidates=appointments.filter((a:any)=>['consultation_completed','checked_in','waiting','called','in_consultation'].includes(a.status)||a.consultationStatus==='signed');
  const pageSize=10;
  const activeAdmissions=ipAdmissions.filter((row:any)=>!isClosedAdmission(row));
  const completedAdmissions=ipAdmissions.filter((row:any)=>isClosedAdmission(row));
  const visibleAdmissions=admissionFilter==='completed'?completedAdmissions:admissionFilter==='all'?ipAdmissions:activeAdmissions;
  const selectedAdmission=ipAdmissions.find((row:any)=>row.id===selectedId)||visibleAdmissions[0]||activeAdmissions[0]||ipAdmissions[0];
  const selectedRoom=ipRooms.find((room:any)=>room.id===selectedAdmission?.room_id);
  const selectedDischargeDate=latestDischarge?.discharge_date||selectedAdmission?.expected_discharge_date||today();
  const autoRoomCharge=selectedAdmission?.room_id&&selectedRoom?{
    description:`${selectedRoom.ward_name} ${selectedRoom.room_number} Bed ${selectedRoom.bed_number}`,
    quantity:chargeableDays(selectedAdmission.admission_date,selectedDischargeDate),
    unit_amount:Number(selectedRoom.daily_rate||0),
  }:null;
  const autoRoomTotal=autoRoomCharge?autoRoomCharge.quantity*autoRoomCharge.unit_amount:0;
  const legacyChargeTotal=charges.reduce((sum,row)=>sum+Number(row.total_amount||0),0);
  const eventBillingTotal=billingItems.filter((row:any)=>row.status==='billable').reduce((sum,row)=>sum+Number(row.total_amount||0),0);
  const runningBillTotal=legacyChargeTotal+eventBillingTotal+autoRoomTotal;
  const totalAdmissionPages=Math.max(1,Math.ceil(visibleAdmissions.length/pageSize));
  const safeAdmissionPage=Math.min(admissionPage,totalAdmissionPages);
  const admissionRows=visibleAdmissions.slice((safeAdmissionPage-1)*pageSize,safeAdmissionPage*pageSize);

  useEffect(()=>{if(!selectedId&&(activeAdmissions[0]||ipAdmissions[0]))setSelectedId((activeAdmissions[0]||ipAdmissions[0]).id)},[activeAdmissions.length,ipAdmissions,selectedId]);
  useEffect(()=>{setAdmissionPage(1)},[admissionFilter]);
  useEffect(()=>{if(admissionPage>totalAdmissionPages)setAdmissionPage(totalAdmissionPages)},[admissionPage,totalAdmissionPages]);
  useEffect(()=>{if(selectedAdmission?.id)loadAdmissionWork(selectedAdmission.id)},[selectedAdmission?.id]);
  useEffect(()=>{loadRooms()},[apiSession?.token,apiSession?.tenantId,branchId,admissionDate,expectedDischargeDate]);
  useEffect(()=>{loadCatalogs()},[apiSession?.token,apiSession?.tenantId,branchId]);

  async function refresh(){
    if(apiSession&&loadLiveData) await loadLiveData(apiSession);
  }

  async function uploadIpDocuments(admissionId:string,documentType:string,files:any[]){
    const selectedFiles=files.filter((file:any)=>file?.name);
    if(!selectedFiles.length||!apiSession)return;
    const upload=new FormData();
    upload.append('document_type',documentType);
    selectedFiles.forEach((file:any)=>upload.append('files',file));
    await apiUpload(`/ip/admissions/${admissionId}/documents`,apiSession,upload);
  }

  async function loadAdmissionWork(admissionId:string){
    if(!apiSession)return;
    setError('');
    try{
      const [treatmentRows,chargeRows,billingRows,documentRows,medOrderRows,medAdministrationRows,invoiceResult]=await Promise.all([
        apiFetch(`/ip/admissions/${admissionId}/treatments`,apiSession),
        apiFetch(`/ip/admissions/${admissionId}/charges`,apiSession),
        apiFetch(`/ip/admissions/${admissionId}/billing-items`,apiSession),
        apiFetch(`/ip/admissions/${admissionId}/documents`,apiSession).catch(()=>[]),
        apiFetch(`/ip/admissions/${admissionId}/medication-orders`,apiSession),
        apiFetch(`/ip/admissions/${admissionId}/medication-administrations`,apiSession),
        apiFetch(`/ip/admissions/${admissionId}/invoice`,apiSession).catch(()=>null),
      ]);
      setTreatments(treatmentRows);
      setCharges(chargeRows);
      setBillingItems(billingRows);
      setIpDocuments(documentRows);
      setMedicationOrders(medOrderRows);
      setMedicationAdministrations(medAdministrationRows);
      setIpInvoice(invoiceResult);
    }catch(err:any){
      setError(err.message||'Unable to load IP admission details.');
    }
  }

  async function loadRooms(){
    if(!apiSession||!branchId)return;
    try{
      const params=new URLSearchParams({branch_id:branchId,available_from:admissionDate,available_to:expectedDischargeDate||admissionDate,include_occupied:'true'});
      const rows=await apiFetch(`/ip/rooms?${params.toString()}`,apiSession);
      if(rows.length===0&&!roomSeedAttempted){
        setRoomSeedAttempted(true);
        await Promise.all(defaultRooms(branchId).map((room)=>apiFetch('/ip/rooms',apiSession,{method:'POST',body:JSON.stringify(room)}).catch(()=>null)));
        const seededRows=await apiFetch(`/ip/rooms?${params.toString()}`,apiSession);
        setIpRooms(seededRows);
        return;
      }
      setIpRooms(rows);
    }catch{
      setIpRooms([]);
    }
  }

  async function loadCatalogs(){
    if(!apiSession)return;
    try{
      const [medicines,tests]=await Promise.all([
        apiFetch('/pharmacy/medicines',apiSession).catch(()=>[]),
        apiFetch('/lab/catalog/tests',apiSession).catch(()=>[]),
      ]);
      setMedicineCatalog(medicines);
      setLabCatalog(tests);
    }catch{
      setMedicineCatalog([]);
      setLabCatalog([]);
    }
  }

  async function submitAdmission(e:any,fromAppointment=false){
    e.preventDefault();
    const form=e.currentTarget;
    const fd=new FormData(e.currentTarget);
    const sourceAppointmentId=String(fd.get('source_appointment_id')||'');
    const patientId=String(fd.get('patient_id')||'');
    const payload={
      branch_id: branchId,
      patient_id: patientId,
      source_appointment_id: sourceAppointmentId||undefined,
      department_id: String(fd.get('department_id')||departmentId||'')||undefined,
      admitting_practitioner_id: String(fd.get('practitioner_id')||'')||undefined,
      room_id:String(fd.get('room_id')||'')||undefined,
      ward: String(fd.get('ward')||'General Ward'),
      room: String(fd.get('room')||'')||undefined,
      bed: String(fd.get('bed')||''),
      admission_date: String(fd.get('admission_date')||today()),
      expected_discharge_date:String(fd.get('expected_discharge_date')||'')||undefined,
      aadhaar_number:String(fd.get('aadhaar_number')||'').replace(/\D/g,'')||undefined,
      reason: String(fd.get('reason')||'')||undefined,
      provisional_diagnosis: String(fd.get('provisional_diagnosis')||'')||undefined,
    };
    setBusy('admission');setError('');setMessage('');
    try{
      if(apiSession){
        const path=fromAppointment&&sourceAppointmentId?`/ip/admissions/from-appointment/${sourceAppointmentId}`:'/ip/admissions';
        const row=await apiFetch(path,apiSession,{method:'POST',body:JSON.stringify(payload)});
        const documentFile=fd.get('admission_document') as File | null;
        if(documentFile?.size){
          const upload=new FormData();
          upload.append('file',documentFile);
          await apiUpload(`/ip/admissions/${row.id}/document`,apiSession,upload);
        }
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
      form.reset();
    }catch(err:any){setError(err.message||'Unable to create IP admission.')}
    finally{setBusy('')}
  }

  async function postWork(e:any,type:'treatment'|'consultation'|'consent'|'discharge'|'charge'){
    e.preventDefault();
    const form=e.currentTarget;
    if(!selectedAdmission)return;
    const fd=new FormData(form);
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
        consultation_type:String(fd.get('consultation_type')||'ward_round'),
        fee_amount:Number(fd.get('fee_amount')||0),
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
      if(type==='consent'||type==='discharge'){
        await uploadIpDocuments(selectedAdmission.id,type,fd.getAll('documents'));
      }
      if(type==='consultation')setLatestConsultation(row);
      if(type==='consent')setLatestConsent(row);
      if(type==='discharge')setLatestDischarge(row);
      await loadAdmissionWork(selectedAdmission.id);
      await refresh();
      setMessage(`${type.replace('_',' ')} saved successfully.`);
      form.reset();
    }catch(err:any){setError(err.message||`Unable to save ${type}.`)}
    finally{setBusy('')}
  }

  async function sign(path:string,label:string,setter:(row:any)=>void){
    setBusy(label);setError('');setMessage('');
    try{
      const row=await apiFetch(path,apiSession,{method:'POST'});
      setter(row);
      setMessage(`${label} completed.`);
      if(selectedAdmission?.id)await loadAdmissionWork(selectedAdmission.id);
      await refresh();
    }catch(err:any){setError(err.message||`Unable to complete ${label}.`)}
    finally{setBusy('')}
  }

  async function createMedicationOrder(e:any){
    e.preventDefault();
    const form=e.currentTarget;
    if(!selectedAdmission)return;
    const fd=new FormData(form);
    const payload={
      medicine_name:String(fd.get('medicine_name')||''),
      dosage:String(fd.get('dosage')||'')||undefined,
      frequency:String(fd.get('frequency')||'')||undefined,
      route:String(fd.get('route')||'')||undefined,
      start_date:String(fd.get('start_date')||today()),
      end_date:String(fd.get('end_date')||'')||undefined,
      unit_amount:Number(fd.get('unit_amount')||0),
    };
    setBusy('medication order');setError('');setMessage('');
    try{
      if(!apiSession)throw new Error('Backend login is required for medication orders.');
      await apiFetch(`/ip/admissions/${selectedAdmission.id}/medication-orders`,apiSession,{method:'POST',body:JSON.stringify(payload)});
      await loadAdmissionWork(selectedAdmission.id);
      setMessage('Medication order saved.');
      form.reset();
    }catch(err:any){setError(err.message||'Unable to save medication order.')}
    finally{setBusy('')}
  }

  async function administerMedication(e:any){
    e.preventDefault();
    const form=e.currentTarget;
    if(!selectedAdmission)return;
    const fd=new FormData(form);
    const orderId=String(fd.get('medication_order_id')||'');
    const payload={
      administered_at:String(fd.get('administered_at')||'')||undefined,
      quantity:Number(fd.get('quantity')||1),
      status:String(fd.get('status')||'given'),
      notes:String(fd.get('notes')||'')||undefined,
    };
    setBusy('medication administration');setError('');setMessage('');
    try{
      if(!apiSession)throw new Error('Backend login is required for medication administration.');
      await apiFetch(`/ip/admissions/${selectedAdmission.id}/medication-orders/${orderId}/administrations`,apiSession,{method:'POST',body:JSON.stringify(payload)});
      await loadAdmissionWork(selectedAdmission.id);
      setMessage('Medicine administration recorded.');
      form.reset();
    }catch(err:any){setError(err.message||'Unable to record medicine administration.')}
    finally{setBusy('')}
  }

  async function generateInvoice(){
    if(!selectedAdmission||!apiSession)return;
    setBusy('invoice');setError('');setMessage('');
    try{
      const detail=await apiFetch(`/ip/admissions/${selectedAdmission.id}/invoice`,apiSession,{method:'POST'});
      setIpInvoice(detail);
      setMessage(`IP invoice ${detail.invoice.invoice_number} generated for ${inr(detail.invoice.total_amount)}.`);
      await refresh();
      await loadAdmissionWork(selectedAdmission.id);
    }catch(err:any){setError(err.message||'Unable to generate IP invoice.')}
    finally{setBusy('')}
  }
  if(view==='convert'){
    return (
      <div className="space-y-6">
        <IPHeader view={view} setView={setView}/>
        <StatusToast message={message} tone="success" onClose={()=>setMessage('')}/>
        <StatusToast message={error} tone="error" onClose={()=>setError('')}/>
        <Card>
          <div className="flex flex-col gap-2">
            <h4 className="text-xl font-bold">Convert OP to IP</h4>
            <p className="text-sm text-slate-500">Use this when an OP patient requires admission after doctor consultation or clinical review.</p>
          </div>
          <form onSubmit={(e)=>submitAdmission(e,true)} className="mt-5 grid gap-4">
            <FormField label="OP Appointment">
              <Select name="source_appointment_id" required className="min-h-[52px]">
                <option value="">Select appointment</option>
                {opCandidates.map((a:any)=><option key={a.id} value={a.id}>{a.patient} · {a.appointmentDate} · {a.doctor}</option>)}
              </Select>
            </FormField>
            {opCandidates.length===0&&<div className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-700">No eligible OP appointments are currently loaded for conversion.</div>}
            <AdmissionFields patients={patients} departmentId={departmentId} rooms={ipRooms} admissionDate={admissionDate} setAdmissionDate={setAdmissionDate} expectedDischargeDate={expectedDischargeDate} setExpectedDischargeDate={setExpectedDischargeDate} hidePatient/>
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
        <StatusToast message={message} tone="success" onClose={()=>setMessage('')}/>
        <StatusToast message={error} tone="error" onClose={()=>setError('')}/>
        <Card>
          <div className="flex flex-col gap-2">
            <h4 className="text-xl font-bold">Direct IP Admission</h4>
            <p className="text-sm text-slate-500">Use this for direct admission, emergency admission, or referred IP cases without an OP appointment.</p>
          </div>
          <form onSubmit={(e)=>submitAdmission(e,false)} className="mt-5 grid gap-4">
            <AdmissionFields patients={patients} departmentId={departmentId} rooms={ipRooms} admissionDate={admissionDate} setAdmissionDate={setAdmissionDate} expectedDischargeDate={expectedDischargeDate} setExpectedDischargeDate={setExpectedDischargeDate}/>
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
      <StatusToast message={message} tone="success" onClose={()=>setMessage('')}/>
      <StatusToast message={error} tone="error" onClose={()=>setError('')}/>

      <div className="grid gap-6">
        <Card>
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
            <div>
              <h4 className="text-lg font-bold">IP Admissions</h4>
              <p className="text-sm text-slate-500">Select active or completed admissions to view the full IP workflow below.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">{activeAdmissions.length} active</Badge>
              <Badge tone="green">{completedAdmissions.length} completed</Badge>
            </div>
          </div>
          <div className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-1 sm:grid-cols-3">
            {[
              ['active','Active',activeAdmissions.length],
              ['completed','Completed',completedAdmissions.length],
              ['all','All',ipAdmissions.length],
            ].map(([key,label,count]:any)=>(
              <button
                key={key}
                type="button"
                onClick={()=>setAdmissionFilter(key)}
                className={`rounded-xl px-3 py-2 text-sm font-bold transition ${admissionFilter===key?'bg-slate-900 text-white':'text-slate-600 hover:bg-white'}`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {visibleAdmissions.length===0&&<p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No {admissionFilter==='all'?'IP':admissionFilter} admissions.</p>}
            {admissionRows.map((row:any)=>{
              const p=patientMap.get(row.patient_id)||patientMap.get(row.patientId);
              const closed=isClosedAdmission(row);
              return (
                <button key={row.id} type="button" onClick={()=>{setSelectedId(row.id);setView('detail')}} className={`min-h-32 rounded-2xl p-4 text-left transition ${selectedAdmission?.id===row.id?'bg-slate-900 text-white':'bg-slate-50 text-slate-900 hover:bg-slate-100'}`}>
                  <div className="line-clamp-2 font-bold">{patientName(p)||row.patient||row.patient_id}</div>
                  <div className={`mt-1 line-clamp-2 text-sm ${selectedAdmission?.id===row.id?'text-slate-300':'text-slate-500'}`}>{admissionLabel(row)}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-bold uppercase ${selectedAdmission?.id===row.id?'bg-white/10 text-white':closed?'bg-emerald-100 text-emerald-700':'bg-blue-100 text-blue-700'}`}>{row.status}</span>
                    <span className={`text-xs font-bold ${selectedAdmission?.id===row.id?'text-slate-300':'text-slate-500'}`}>{closed?'Completed details':'Active details'}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <Pagination page={safeAdmissionPage} totalPages={totalAdmissionPages} total={visibleAdmissions.length} pageSize={pageSize} onPage={setAdmissionPage}/>
        </Card>

        <Card>
          <h4 className="text-lg font-bold">IP Workflow</h4>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Info title="Admission" value={selectedAdmission?admissionLabel(selectedAdmission):'No admission selected'}/>
            <Info title="Treatments" value={treatments.length}/>
            <Info title="Running Bill" value={inr(runningBillTotal)}/>
          </div>
          {selectedAdmission&&(
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Info title="Patient" value={patientName(patientMap.get(selectedAdmission.patient_id)||patientMap.get(selectedAdmission.patientId))}/>
              <Info title="Status" value={String(selectedAdmission.status||'-').toUpperCase()}/>
              <Info title="Admission Date" value={selectedAdmission.admission_date||'-'}/>
              <Info title="Planned Discharge" value={selectedAdmission.expected_discharge_date||'-'}/>
              <Info title="Aadhaar" value={selectedAdmission.aadhaar_number||'Not captured'}/>
              <Info title="Payable Amount" value={inr(runningBillTotal)}/>
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase text-slate-500">Admission File</div>
                {selectedAdmission.admission_document_url?(
                  <a href={`${UPLOADS_BASE}${selectedAdmission.admission_document_url}`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex break-all text-sm font-bold text-blue-700 underline">
                    {selectedAdmission.admission_document_name||'View uploaded file'}
                  </a>
                ):(
                  <div className="mt-1 text-sm font-bold text-slate-500">Not uploaded</div>
                )}
              </div>
            </div>
          )}
          {selectedAdmission&&(
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Info title="Room Amount" value={inr(autoRoomTotal)}/>
              <Info title="Billable Items" value={inr(eventBillingTotal)}/>
              <Info title="Legacy Charges" value={inr(legacyChargeTotal)}/>
            </div>
          )}
          <p className="mt-4 text-sm text-slate-500">Select an IP admission from the left to manage treatment, consultation, consent, discharge, and billing.</p>
        </Card>
      </div>

      {selectedAdmission&&(
        <IPCareWorkspace
          admission={selectedAdmission}
          treatments={treatments}
          charges={charges}
          billingItems={billingItems}
          ipDocuments={ipDocuments}
          medicationOrders={medicationOrders}
          medicationAdministrations={medicationAdministrations}
          medicineCatalog={medicineCatalog}
          labCatalog={labCatalog}
          autoRoomCharge={autoRoomCharge}
          autoRoomTotal={autoRoomTotal}
          runningBillTotal={runningBillTotal}
          ipInvoice={ipInvoice}
          apiSession={apiSession}
          busy={busy}
          setBusy={setBusy}
          setError={setError}
          setMessage={setMessage}
          loadAdmissionWork={loadAdmissionWork}
          refresh={refresh}
          generateInvoice={generateInvoice}
          postWork={postWork}
          latestConsent={latestConsent}
          latestDischarge={latestDischarge}
          setLatestConsent={setLatestConsent}
          setLatestDischarge={setLatestDischarge}
          sign={sign}
        />
      )}
    </div>
  );
}

function splitRows(value:string){return value.split('\n').map((line)=>line.trim()).filter(Boolean)}
function appendLine(value:string,line:string){return [...splitRows(value),line].join('\n')}
function parseAmount(value:any){const amount=Number(String(value||'').replace(/[^\d.]/g,''));return Number.isFinite(amount)?amount:0}
function catalogKey(value:any){return String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'')}
function isClosedAdmission(admission:any){return ['discharged','cancelled'].includes(String(admission?.status||'').toLowerCase())}

function IPCareWorkspace({
  admission,
  treatments,
  charges,
  billingItems,
  ipDocuments,
  medicationOrders,
  medicationAdministrations,
  medicineCatalog,
  labCatalog,
  autoRoomCharge,
  autoRoomTotal,
  runningBillTotal,
  ipInvoice,
  apiSession,
  busy,
  setBusy,
  setError,
  setMessage,
  loadAdmissionWork,
  refresh,
  generateInvoice,
  postWork,
  latestConsent,
  latestDischarge,
  setLatestConsent,
  setLatestDischarge,
  sign,
}:any){
  const [medicineRows,setMedicineRows]=useState('Paracetamol | 500 mg | 1-0-1 | oral');
  const [referralRows,setReferralRows]=useState('lab | CBC | routine | Fever workup');
  const [medicineTagText,setMedicineTagText]=useState('');
  const [referralTagText,setReferralTagText]=useState('');
  const [medName,setMedName]=useState('');
  const [selectedMedicineId,setSelectedMedicineId]=useState('');
  const [medDose,setMedDose]=useState('');
  const [medFrequency,setMedFrequency]=useState('1-0-1');
  const [medRoute,setMedRoute]=useState('oral');
  const [refType,setRefType]=useState('lab');
  const [selectedLabTestId,setSelectedLabTestId]=useState('');
  const [refName,setRefName]=useState('');
  const [refPriority,setRefPriority]=useState('routine');
  const [detailTab,setDetailTab]=useState<'consent'|'discharge'>('consent');
  const [openSections,setOpenSections]=useState<any>({runningBill:true,details:false,history:false});
  const closed=isClosedAdmission(admission);
  const consentDocuments=ipDocuments.filter((doc:any)=>doc.document_type==='consent');
  const dischargeDocuments=ipDocuments.filter((doc:any)=>doc.document_type==='discharge');
  const labScanBillingItems=billingItems.filter((row:any)=>String(row.source_type||'').includes('lab')||String(row.source_type||'').includes('scan'));
  const medicineOptions=medicineCatalog.map((medicine:any)=>({value:medicine.id,label:medicine.name,item:medicine}));
  const labOptions=labCatalog.map((test:any)=>({value:test.id,label:test.name,item:test}));
  const toggleSection=(key:string)=>setOpenSections((state:any)=>({...state,[key]:!state[key]}));

  function medicineUnitAmount(name:string){
    const key=catalogKey(name);
    const selected=medicineCatalog.find((row:any)=>row.id===selectedMedicineId);
    const match=medicineCatalog.find((row:any)=>catalogKey(row.name)===key||catalogKey(row.code)===key||catalogKey(row.generic_name)===key);
    return Number((match||selected)?.default_sale_price||0);
  }

  function labUnitAmount(name:string){
    const key=catalogKey(name);
    const selected=labCatalog.find((row:any)=>row.id===selectedLabTestId);
    const match=labCatalog.find((row:any)=>catalogKey(row.name)===key||catalogKey(row.code)===key);
    return Number((match||selected)?.default_price||0);
  }

  useEffect(()=>{
    if(!selectedMedicineId&&medicineCatalog[0]?.id){
      const first=medicineCatalog[0];
      setSelectedMedicineId(first.id);
      setMedName(first.name||'');
      setMedDose(first.strength||'');
    }
  },[medicineCatalog,selectedMedicineId]);
  useEffect(()=>{
    if(!selectedLabTestId&&labCatalog[0]?.id){
      const first=labCatalog[0];
      setSelectedLabTestId(first.id);
      setRefName(first.name||'');
      setRefType(String(first.category||first.test_type||first.sample_type||'').toLowerCase().includes('scan')?'scan':'lab');
    }
  },[labCatalog,selectedLabTestId]);

  function selectMedicine(id:string){
    setSelectedMedicineId(id);
    const medicine=medicineCatalog.find((row:any)=>row.id===id);
    if(!medicine)return;
    setMedName(medicine.name||'');
    setMedDose(medicine.strength||'');
  }

  function selectLabTest(id:string){
    setSelectedLabTestId(id);
    const test=labCatalog.find((row:any)=>row.id===id);
    if(!test)return;
    setRefName(test.name||'');
    const text=[test.category,test.test_type,test.sample_type,test.name].join(' ').toLowerCase();
    setRefType(text.includes('x-ray')||text.includes('ecg')||text.includes('scan')||text.includes('procedure')?'scan':'lab');
  }

  function addMedicineRow(){
    if(!medName.trim())return;
    setMedicineRows(appendLine(medicineRows,[medName,medDose,medFrequency,medRoute,medicineUnitAmount(medName)].map((part)=>String(part||'').trim()).join(' | ')));
    setMedName('');setMedDose('');
  }
  function addMedicineFromText(value:string){
    const text=String(value||'').trim();
    if(!text)return;
    const line=text.includes('|')?text:[text,medDose,medFrequency,medRoute,medicineUnitAmount(text)].map((part)=>String(part||'').trim()).join(' | ');
    setMedicineRows((rows:string)=>appendLine(rows,line));
  }
  function removeMedicineRow(index:number){
    setMedicineRows((rows:string)=>splitRows(rows).filter((_:string,i:number)=>i!==index).join('\n'));
  }

  function addReferralRow(){
    if(!refName.trim())return;
    setReferralRows(appendLine(referralRows,[refType,refName,refPriority,'',labUnitAmount(refName)].map((part)=>String(part||'').trim()).join(' | ')));
    setRefName('');
  }
  function addReferralFromText(value:string){
    const text=String(value||'').trim();
    if(!text)return;
    const line=text.includes('|')?text:[refType,text,refPriority,'',labUnitAmount(text)].map((part)=>String(part||'').trim()).join(' | ');
    setReferralRows((rows:string)=>appendLine(rows,line));
  }
  function removeReferralRow(index:number){
    setReferralRows((rows:string)=>splitRows(rows).filter((_:string,i:number)=>i!==index).join('\n'));
  }

  async function submitCare(e:any){
    e.preventDefault();
    if(closed){
      setError('This IP admission is discharged. New care entries and billing items are locked.');
      return;
    }
    const fd=new FormData(e.currentTarget);
    const careDate=String(fd.get('care_date')||today());
    const roundType=String(fd.get('round_type')||'ward_round');
    const notes=String(fd.get('notes')||'');
    const complaints=String(fd.get('complaints')||'')||undefined;
    const diagnosis=String(fd.get('diagnosis')||'')||undefined;
    const feeAmount=Number(fd.get('fee_amount')||0);
    const markGiven=Boolean(fd.get('mark_given'));
    const vitals={bp:String(fd.get('bp')||''),pulse:String(fd.get('pulse')||''),temperature:String(fd.get('temperature')||'')};
    setBusy('ip care');setError('');setMessage('');
    try{
      if(!apiSession)throw new Error('Backend login is required for IP care.');
      await apiFetch(`/ip/admissions/${admission.id}/treatments`,apiSession,{method:'POST',body:JSON.stringify({
        treatment_date:careDate,
        treatment_type:roundType,
        notes,
        medication_summary:medicineRows||undefined,
        orders:referralRows||undefined,
      })});
      const consultation=await apiFetch(`/ip/admissions/${admission.id}/consultations`,apiSession,{method:'POST',body:JSON.stringify({
        consultation_date:careDate,
        consultation_type:roundType,
        fee_amount:feeAmount,
        vitals_json:JSON.stringify(vitals),
        complaints,
        diagnosis,
        notes,
        prescription_text:medicineRows||undefined,
      })});
      await apiFetch(`/ip/consultations/${consultation.id}/sign`,apiSession,{method:'POST'});

      const knownOrders=[...medicationOrders];
      for(const line of splitRows(medicineRows)){
        const [medicine_name,dosage,frequency,route,amountText]=line.split('|').map((part)=>part.trim());
        if(!medicine_name)continue;
        const unitAmount=parseAmount(amountText)||medicineUnitAmount(medicine_name);
        let order=knownOrders.find((row:any)=>
          String(row.status||'active')==='active'
          && String(row.medicine_name||'').toLowerCase()===medicine_name.toLowerCase()
          && String(row.dosage||'')===String(dosage||'')
          && String(row.frequency||'')===String(frequency||'')
          && String(row.route||'')===String(route||'')
          && Number(row.unit_amount||0)===unitAmount
        );
        if(!order){
          order=await apiFetch(`/ip/admissions/${admission.id}/medication-orders`,apiSession,{method:'POST',body:JSON.stringify({
            medicine_name,
            dosage:dosage||undefined,
            frequency:frequency||undefined,
            route:route||undefined,
            start_date:careDate,
            unit_amount:unitAmount,
          })});
          knownOrders.push(order);
        }
        if(markGiven){
          await apiFetch(`/ip/admissions/${admission.id}/medication-orders/${order.id}/administrations`,apiSession,{method:'POST',body:JSON.stringify({quantity:dailyDoseQuantity(dosage,frequency),status:'given',notes:'Given from IP care entry'})});
        }
      }

      for(const line of splitRows(referralRows)){
        const [sourceType,itemName,priority,instructions,amountText]=line.split('|').map((part)=>part.trim());
        if(!itemName)continue;
        const normalizedType=sourceType==='scan'?'scan_referral':'lab_referral';
        const amount=parseAmount(amountText)||labUnitAmount(itemName);
        if(amount>0){
          await apiFetch(`/ip/admissions/${admission.id}/billing-items`,apiSession,{method:'POST',body:JSON.stringify({
            source_type:normalizedType,
            description:`${sourceType?.toUpperCase()||'LAB'} - ${itemName}${priority?` (${priority})`:''}${instructions?` - ${instructions}`:''}`,
            quantity:1,
            unit_amount:amount,
          })});
        }
      }

      await loadAdmissionWork(admission.id);
      await refresh();
      setMessage('IP care entry saved, signed, and billable items updated.');
    }catch(err:any){
      setError(err.message||'Unable to save IP care entry.');
    }finally{
      setBusy('');
    }
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-6">
      <Card>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h4 className="text-lg font-bold">Daily IP Care Entry</h4>
            <p className="text-sm text-slate-500">One entry saves the clinical round, medicines, lab/scan referrals, and running bill updates.</p>
          </div>
          <Badge tone={closed?'green':'blue'}>{closed?'Discharged':admission.admission_number}</Badge>
        </div>
        {closed&&<div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">This IP admission is discharged and locked. Use Invoices to view or collect against the final bill.</div>}
        <form onSubmit={submitCare} className="mt-5 grid gap-4">
          <div className="grid gap-3 md:grid-cols-4">
            <FormField label="Date"><Input name="care_date" type="date" defaultValue={today()}/></FormField>
            <FormField label="Round"><Select name="round_type"><option value="ward_round">Ward Round</option><option value="admission_visit">Admission Visit</option><option value="emergency_visit">Emergency Visit</option><option value="procedure">Procedure</option><option value="discharge_round">Discharge Round</option></Select></FormField>
            <FormField label="Visit Fee"><Input name="fee_amount" type="number" min="0" defaultValue="500"/></FormField>
            <label className="flex items-end gap-2 pb-3 text-sm font-bold text-slate-700"><input name="mark_given" type="checkbox" defaultChecked/> Give medicines now</label>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <FormField label="BP"><Input name="bp" placeholder="120/80"/></FormField>
            <FormField label="Pulse"><Input name="pulse" placeholder="78"/></FormField>
            <FormField label="Temp"><Input name="temperature" placeholder="98.6 F"/></FormField>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Complaints"><Input name="complaints" placeholder="Current IP complaints"/></FormField>
            <FormField label="Diagnosis"><Input name="diagnosis" placeholder="Working diagnosis"/></FormField>
          </div>
          <FormField label="Clinical Notes"><textarea name="notes" required className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none" placeholder="Progress, assessment, care plan, response"/></FormField>

          <div className="rounded-3xl bg-slate-50 p-4">
            <FormField label="Medicine Rows">
              <TagEntryBox
                tags={splitRows(medicineRows)}
                value={medicineTagText}
                onChange={setMedicineTagText}
                onSubmit={addMedicineFromText}
                onRemove={removeMedicineRow}
                getLabel={rowTagLabel}
                placeholder="Type medicine and press Enter"
                disabled={closed}
                submitOnComma={false}
              />
            </FormField>
            <div className="mt-3 grid gap-2 lg:grid-cols-[1.2fr_.8fr_.7fr_.7fr_auto] lg:items-end">
              <FormField label="Medicine">
                {medicineCatalog.length>0?(
                  <SearchPicker
                    value={selectedMedicineId}
                    onChange={(medicineId:string)=>selectMedicine(medicineId)}
                    options={medicineOptions}
                    placeholder="Type medicine name"
                    disabled={closed}
                    onEnterQuery={(value:string,option:any)=>{
                      const medicine=option?.item;
                      if(medicine){
                        setSelectedMedicineId(medicine.id);
                        setMedName(medicine.name||'');
                        setMedicineRows((rows:string)=>appendLine(rows,[medicine.name,medicine.strength||medDose,medFrequency,medRoute,Number(medicine.default_sale_price||0)].map((part)=>String(part||'').trim()).join(' | ')));
                        setMedDose('');
                      }else addMedicineFromText(value);
                    }}
                    getSearchText={(medicine:any)=>[medicine?.name,medicine?.strength,medicine?.generic_name,medicine?.brand_name,medicine?.category].filter(Boolean).join(' ')}
                  />
                ):(
                  <Input value={medName} onChange={(e:any)=>setMedName(e.target.value)} placeholder="Ceftriaxone"/>
                )}
              </FormField>
              <FormField label="Dose"><Input value={medDose} onChange={(e:any)=>setMedDose(e.target.value)} placeholder="1 g"/></FormField>
              <FormField label="Freq"><Select value={medFrequency} onChange={(e:any)=>setMedFrequency(e.target.value)}>{[...new Set([medFrequency,...medicineFrequencyOptions])].filter(Boolean).map((value:string)=><option key={value} value={value}>{value}</option>)}</Select></FormField>
              <FormField label="Route"><Select value={medRoute} onChange={(e:any)=>setMedRoute(e.target.value)}><option value="oral">Oral</option><option value="iv">IV</option><option value="im">IM</option><option value="sc">SC</option></Select></FormField>
              <Button type="button" onClick={addMedicineRow} disabled={closed}>Add</Button>
            </div>
            {medicineCatalog.length>0&&<div className="mt-3 flex flex-wrap gap-2">{medicineCatalog.slice(0,8).map((medicine:any)=><button key={medicine.id} type="button" onClick={()=>selectMedicine(medicine.id)} className="rounded-xl border bg-white px-3 py-2 text-xs font-bold">{medicine.name}</button>)}</div>}
          </div>

          <div className="rounded-3xl bg-slate-50 p-4">
            <FormField label="Lab / Scan Rows">
              <TagEntryBox
                tags={splitRows(referralRows)}
                value={referralTagText}
                onChange={setReferralTagText}
                onSubmit={addReferralFromText}
                onRemove={removeReferralRow}
                getLabel={rowTagLabel}
                placeholder="Type lab / scan and press Enter"
                disabled={closed}
                submitOnComma={false}
              />
            </FormField>
            <div className="mt-3 grid gap-2 lg:grid-cols-[.7fr_1.2fr_.7fr_auto] lg:items-end">
              <FormField label="Type"><Select value={refType} onChange={(e:any)=>setRefType(e.target.value)}><option value="lab">Lab</option><option value="scan">Scan</option></Select></FormField>
              <FormField label="Item">
                {labCatalog.length>0?(
                  <SearchPicker
                    value={selectedLabTestId}
                    onChange={(testId:string)=>selectLabTest(testId)}
                    options={labOptions}
                    placeholder="Type lab / scan name"
                    disabled={closed}
                    onEnterQuery={(value:string,option:any)=>{
                      const test=option?.item;
                      if(test){
                        const text=[test.category,test.test_type,test.sample_type,test.name].join(' ').toLowerCase();
                        const sourceType=text.includes('x-ray')||text.includes('ecg')||text.includes('scan')||text.includes('procedure')?'scan':'lab';
                        setSelectedLabTestId(test.id);
                        setReferralRows((rows:string)=>appendLine(rows,[sourceType,test.name,refPriority,'',Number(test.default_price||0)].map((part)=>String(part||'').trim()).join(' | ')));
                        setRefName('');
                      }else addReferralFromText(value);
                    }}
                    getSearchText={(test:any)=>[test?.name,test?.sample_type,test?.category,test?.code].filter(Boolean).join(' ')}
                  />
                ):(
                  <Input value={refName} onChange={(e:any)=>setRefName(e.target.value)} placeholder="CBC / X-Ray"/>
                )}
              </FormField>
              <FormField label="Priority"><Select value={refPriority} onChange={(e:any)=>setRefPriority(e.target.value)}><option value="routine">Routine</option><option value="urgent">Urgent</option><option value="stat">STAT</option></Select></FormField>
              <Button type="button" onClick={addReferralRow} disabled={closed}>Add</Button>
            </div>
            {labCatalog.length>0&&<div className="mt-3 flex flex-wrap gap-2">{labCatalog.slice(0,8).map((test:any)=><button key={test.id} type="button" onClick={()=>selectLabTest(test.id)} className="rounded-xl border bg-white px-3 py-2 text-xs font-bold">{test.name}</button>)}</div>}
          </div>

          <Button disabled={closed||busy==='ip care'}>{busy==='ip care'?'Saving...':closed?'Admission Locked':'Save IP Care Entry'}</Button>
        </form>
      </Card>

        <Card>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-1">
            <button type="button" onClick={()=>setDetailTab('consent')} className={`rounded-xl px-3 py-2 text-sm font-bold ${detailTab==='consent'?'bg-slate-900 text-white':'text-slate-600'}`}>Consent Form</button>
            <button type="button" onClick={()=>setDetailTab('discharge')} className={`rounded-xl px-3 py-2 text-sm font-bold ${detailTab==='discharge'?'bg-slate-900 text-white':'text-slate-600'}`}>Discharge Summary</button>
          </div>
          {detailTab==='consent'?(
            <form onSubmit={(e)=>postWork(e,'consent')} className="mt-4 grid gap-3">
              <FormField label="Consent Title"><Input name="title" defaultValue="General IP Admission Consent"/></FormField>
              <FormField label="Consent Text"><Input name="content" defaultValue="Patient/guardian consent received for in-patient admission, investigation, treatment, billing, and discharge process."/></FormField>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Guardian Name"><Input name="patient_or_guardian_name" placeholder="Patient / guardian name"/></FormField>
                <FormField label="Relationship"><Input name="relationship" placeholder="Self / spouse / parent"/></FormField>
              </div>
              <FormField label="Consent Files">
                <Input name="documents" type="file" multiple accept="image/*,.pdf,.doc,.docx"/>
              </FormField>
              {consentDocuments.length>0&&<div className="flex flex-wrap gap-2">{consentDocuments.map((doc:any)=><a key={doc.id} href={`${UPLOADS_BASE}${doc.file_url}`} target="_blank" rel="noopener noreferrer" className="rounded-xl border px-3 py-2 text-xs font-bold text-blue-700 underline">{doc.file_name}</a>)}</div>}
              <div className="flex flex-wrap gap-2"><Button disabled={closed||busy==='consent'}>Save Consent</Button><Button type="button" disabled={closed||!latestConsent||busy==='consent sign'} onClick={()=>sign(`/ip/consents/${latestConsent.id}/sign`,'consent sign',setLatestConsent)} className="bg-emerald-700">Mark Signed</Button></div>
            </form>
          ):(
            <form onSubmit={(e)=>postWork(e,'discharge')} className="mt-4 grid gap-3">
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Discharge Date"><Input name="discharge_date" type="date" defaultValue={today()}/></FormField>
                <FormField label="Final Diagnosis"><Input name="final_diagnosis" required/></FormField>
              </div>
              <FormField label="Advice"><Input name="follow_up_advice"/></FormField>
              <FormField label="Discharge Files">
                <Input name="documents" type="file" multiple accept="image/*,.pdf,.doc,.docx"/>
              </FormField>
              {dischargeDocuments.length>0&&<div className="flex flex-wrap gap-2">{dischargeDocuments.map((doc:any)=><a key={doc.id} href={`${UPLOADS_BASE}${doc.file_url}`} target="_blank" rel="noopener noreferrer" className="rounded-xl border px-3 py-2 text-xs font-bold text-blue-700 underline">{doc.file_name}</a>)}</div>}
              <div className="flex flex-wrap gap-2"><Button disabled={closed||busy==='discharge'}>Save Summary</Button><Button type="button" disabled={closed||!latestDischarge||busy==='discharge finalize'} onClick={()=>sign(`/ip/discharge-summaries/${latestDischarge.id}/finalize`,'discharge finalize',setLatestDischarge)} className="bg-emerald-700">{closed?'Discharged':'Finalize'}</Button></div>
            </form>
          )}
        </Card>

        <CollapsibleIPSection
          title="Running Bill"
          badge={inr(runningBillTotal)}
          summary={`${billingItems.length+charges.length+(autoRoomCharge?1:0)} bill row(s)`}
          isOpen={openSections.runningBill}
          onToggle={()=>toggleSection('runningBill')}
        >
          <div className="mt-3 grid gap-2">
            {autoRoomCharge&&<div className="flex justify-between gap-3 rounded-xl bg-slate-50 p-2 text-sm"><span>Room · {autoRoomCharge.quantity} day(s)</span><b>{inr(autoRoomTotal)}</b></div>}
            {billingItems.map((row:any)=><div key={row.id} className="flex justify-between gap-3 text-sm"><span>{row.description}</span><b>{inr(row.total_amount)}</b></div>)}
            {charges.map((row:any)=><div key={row.id} className="flex justify-between gap-3 text-sm"><span>{row.description}</span><b>{inr(row.total_amount)}</b></div>)}
            <div className="border-t pt-3 text-right text-xl font-black">{inr(runningBillTotal)}</div>
          </div>
          {ipInvoice&&!closed&&(
            <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
              <span className="font-bold">Invoice {ipInvoice.invoice?.invoice_number}</span> · {inr(ipInvoice.invoice?.total_amount)} · <span className="uppercase">{ipInvoice.invoice?.status}</span>
            </div>
          )}
          <Button type="button" disabled={closed||runningBillTotal<=0||busy==='invoice'} onClick={generateInvoice} className="mt-4 w-full">
            {busy==='invoice'?'Generating...':(closed?'Final Bill Locked':(ipInvoice?'Regenerate IP Invoice':'Generate IP Invoice'))}
          </Button>
        </CollapsibleIPSection>

        <CollapsibleIPSection
          title="Medicine / Lab Details"
          badge={`${medicationOrders.length} meds · ${labScanBillingItems.length} lab/scan`}
          summary="Suggestions, active medication orders, and investigation bill rows"
          isOpen={openSections.details}
          onToggle={()=>toggleSection('details')}
        >
          <div className="mt-3 grid gap-3">
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase text-slate-500">Medicine Suggestions</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {medicineCatalog.slice(0,6).map((medicine:any)=><span key={medicine.id} className="rounded-xl bg-white px-3 py-2 text-xs font-bold">{medicine.name}</span>)}
                {medicineCatalog.length===0&&<span className="text-sm text-slate-500">No medicine catalog loaded.</span>}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase text-slate-500">Medication Orders</p>
              <div className="mt-2 grid gap-2">
                {medicationOrders.slice(0,5).map((row:any)=><div key={row.id} className="rounded-xl bg-white p-2 text-sm"><b>{row.medicine_name}</b><p className="text-xs text-slate-500">{[row.dosage,row.frequency,row.route,row.status].filter(Boolean).join(' · ')}</p></div>)}
                {medicationOrders.length===0&&<span className="text-sm text-slate-500">No medication orders yet.</span>}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase text-slate-500">Lab / Scan Suggestions</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {labCatalog.slice(0,6).map((test:any)=><span key={test.id} className="rounded-xl bg-white px-3 py-2 text-xs font-bold">{test.name}</span>)}
                {labCatalog.length===0&&<span className="text-sm text-slate-500">No lab catalog loaded.</span>}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase text-slate-500">Lab / Scan Billing Details</p>
              <div className="mt-2 grid gap-2">
                {labScanBillingItems.slice(0,5).map((row:any)=><div key={row.id} className="flex justify-between gap-2 rounded-xl bg-white p-2 text-sm"><span>{row.description}</span><b>{inr(row.total_amount)}</b></div>)}
                {labScanBillingItems.length===0&&<span className="text-sm text-slate-500">No lab/scan billing rows yet.</span>}
              </div>
            </div>
          </div>
        </CollapsibleIPSection>

        <CollapsibleIPSection
          title="Care History"
          badge={`${treatments.length} entries`}
          summary={`${medicationOrders.length} medication order(s), ${medicationAdministrations.length} administration(s)`}
          isOpen={openSections.history}
          onToggle={()=>toggleSection('history')}
        >
          <div className="mt-3 grid gap-2">
            {treatments.slice(0,4).map((row:any)=><div key={row.id} className="rounded-2xl bg-slate-50 p-3 text-sm"><b>{row.treatment_date} · {row.treatment_type}</b><p className="text-slate-500">{row.notes}</p></div>)}
            {treatments.length===0&&<p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-500">No care entries yet.</p>}
          </div>
          <div className="mt-4 grid gap-2 text-sm text-slate-500">
            <p>{medicationOrders.length} medication orders</p>
            <p>{medicationAdministrations.length} medicine administrations</p>
          </div>
        </CollapsibleIPSection>
      </div>
    </div>
  );
}

function CollapsibleIPSection({title,badge,summary,isOpen,onToggle,children}:any){
  return (
    <Card className="overflow-hidden !p-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-bold">{title}</h4>
            {badge&&<Badge tone="blue">{badge}</Badge>}
          </div>
          {summary&&<p className="mt-1 truncate text-sm font-semibold text-slate-500">{summary}</p>}
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white">
          <ChevronDown size={18} className={`transition ${isOpen?'rotate-180':'rotate-0'}`}/>
        </span>
      </button>
      {isOpen&&<div className="border-t border-slate-100 px-5 py-4">{children}</div>}
    </Card>
  );
}

function Pagination({page,totalPages,total,pageSize,onPage}:any){
  const start=total===0?0:(page-1)*pageSize+1;
  const end=Math.min(page*pageSize,total);
  return <div className="mt-4 flex flex-col justify-between gap-3 text-sm text-slate-500 sm:flex-row sm:items-center">
    <span>Showing {start}-{end} of {total}</span>
    <div className="flex gap-2">
      <button type="button" onClick={()=>onPage(Math.max(1,page-1))} disabled={page<=1} className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300">Previous</button>
      <span className="rounded-xl bg-slate-50 px-3 py-2 font-bold text-slate-700">Page {page} / {totalPages}</span>
      <button type="button" onClick={()=>onPage(Math.min(totalPages,page+1))} disabled={page>=totalPages} className="rounded-xl border px-3 py-2 font-bold text-slate-700 disabled:text-slate-300">Next</button>
    </div>
  </div>
}

function AdmissionFields({patients,departmentId,rooms=[],admissionDate,setAdmissionDate,expectedDischargeDate,setExpectedDischargeDate,hidePatient=false}:any){
  const availableRooms=rooms.filter((room:any)=>room.available);
  const wardNames=Array.from(new Set(rooms.map((room:any)=>room.ward_name).filter(Boolean)));
  const [ward,setWard]=useState('');
  const [roomNumber,setRoomNumber]=useState('');
  const [roomId,setRoomId]=useState('');
  const wardRooms=rooms.filter((room:any)=>!ward||room.ward_name===ward);
  const roomNumbers=Array.from(new Set(wardRooms.map((room:any)=>room.room_number).filter(Boolean)));
  const bedRows=wardRooms.filter((room:any)=>!roomNumber||room.room_number===roomNumber);
  const selectedRoom=rooms.find((room:any)=>room.id===roomId)||bedRows.find((room:any)=>room.available)||availableRooms[0]||rooms[0];
  const selectedBed=rooms.find((room:any)=>room.id===roomId);
  useEffect(()=>{
    if(!rooms.length)return;
    const next=selectedRoom||rooms[0];
    if(!ward)setWard(next.ward_name||'');
    if(!roomNumber)setRoomNumber(next.room_number||'');
    if(!roomId&&next.available)setRoomId(next.id);
  },[rooms.length,ward,roomNumber,roomId,selectedRoom?.id]);
  useEffect(()=>{
    const nextRoom=rooms.find((room:any)=>room.ward_name===ward&&room.available)||rooms.find((room:any)=>room.ward_name===ward);
    setRoomNumber(nextRoom?.room_number||'');
    setRoomId(nextRoom?.available?nextRoom.id:'');
  },[ward]);
  useEffect(()=>{
    const nextBed=rooms.find((room:any)=>room.ward_name===ward&&room.room_number===roomNumber&&room.available);
    setRoomId(nextBed?.id||'');
  },[roomNumber,ward]);
  return (
    <>
      {!hidePatient&&(
        <FormField label="Patient">
          <Select name="patient_id" required>
            <option value="">Select patient</option>
            {patients.map((p:any)=><option key={p.id} value={p.id}>{patientName(p)} · {p.mobile||p.patientNumber||p.id}</option>)}
          </Select>
        </FormField>
      )}
      <input type="hidden" name="department_id" value={departmentId||''}/>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Admission Date"><Input name="admission_date" type="date" value={admissionDate} onChange={(e:any)=>setAdmissionDate(e.target.value)} required/></FormField>
        <FormField label="Planned Discharge"><Input name="expected_discharge_date" type="date" value={expectedDischargeDate} min={admissionDate} onChange={(e:any)=>setExpectedDischargeDate(e.target.value)}/></FormField>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Aadhaar Number"><Input name="aadhaar_number" inputMode="numeric" pattern="\d{12}" maxLength={12} placeholder="12 digit Aadhaar number"/></FormField>
        <FormField label="Admission File">
          <input name="admission_document" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx" className="block w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-bold"/>
        </FormField>
      </div>
      {rooms.length>0?(
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <FormField label="Ward">
              <Select value={ward} onChange={(e:any)=>setWard(e.target.value)} required>
                {wardNames.map((name:any)=><option key={name} value={name}>{name}</option>)}
              </Select>
            </FormField>
            <FormField label="Room">
              <Select value={roomNumber} onChange={(e:any)=>setRoomNumber(e.target.value)} required>
                <option value="">Select room</option>
                {roomNumbers.map((number:any)=><option key={number} value={number}>Room {number}</option>)}
              </Select>
            </FormField>
            <FormField label="Bed">
              <Select name="room_id" value={roomId} onChange={(e:any)=>setRoomId(e.target.value)} required>
                <option value="">Select bed by availability</option>
                {bedRows.map((room:any)=><option key={room.id} value={room.id} disabled={!room.available}>{room.bed_number} · {room.available?'Available':'Occupied'} · {inr(room.daily_rate)}/day</option>)}
              </Select>
            </FormField>
          </div>
          <div className="grid gap-2 rounded-2xl bg-slate-50 p-3 text-sm sm:grid-cols-3">
            <div><b>{availableRooms.length}</b> available bed(s)</div>
            <div><b>{Math.max(rooms.length-availableRooms.length,0)}</b> occupied bed(s)</div>
            <div className={selectedBed?.available?'text-emerald-700':'text-amber-700'}>
              {selectedBed?`Selected ${selectedBed.bed_number}: ${selectedBed.available?'available':'occupied'}`:'Select an available bed'}
            </div>
          </div>
          <input type="hidden" name="ward" value={selectedRoom?.ward_name||'General Ward'}/>
          <input type="hidden" name="room" value={selectedRoom?.room_number||''}/>
          <input type="hidden" name="bed" value={selectedRoom?.bed_number||''}/>
          {availableRooms.length===0&&<div className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-700">No beds are available for the selected date range in this branch.</div>}
        </>
      ):(
        <>
          <div className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-700">No IP room master is configured for this branch. Add ward/room/bed records from the backend room API before using availability-based admission.</div>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Ward"><Select name="ward"><option>General Ward</option><option>Private Room</option><option>ICU</option><option>Emergency Ward</option></Select></FormField>
            <FormField label="Bed"><Input name="bed" required/></FormField>
          </div>
          <FormField label="Room"><Input name="room"/></FormField>
        </>
      )}
      <FormField label="Reason"><Input name="reason" placeholder="Reason for IP admission"/></FormField>
      <FormField label="Provisional Diagnosis"><Input name="provisional_diagnosis"/></FormField>
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
