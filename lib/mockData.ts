export const clinics = [
  { id:'c1', name:'Sunrise Single Clinic', type:'Single Clinic', multiBranch:false, modules:['appointments','patients','doctor','billing','reports'], branches:[{id:'b1',name:'Main Clinic',city:'Chennai'}], departments:['general'], consultationFees:{ general:200 } },
  { id:'c2', name:'City Care Polyclinic', type:'Polyclinic', multiBranch:true, modules:['appointments','patients','doctor','lab','billing','subscriptions','reports'], branches:[{id:'b2',name:'Tambaram Branch',city:'Chennai'},{id:'b3',name:'Velachery Branch',city:'Chennai'}], departments:['general','ent','gyn','ped'], consultationFees:{ general:250, ent:350, gyn:400, ped:300 } },
  { id:'c3', name:'MediCity Multi Speciality Hospital', type:'Multi Speciality Hospital', multiBranch:true, modules:['appointments','patients','ip','doctor','lab','pharmacy','billing','subscriptions','reports','scheduling','practitioners'], branches:[{id:'b4',name:'Anna Nagar Hospital',city:'Chennai'},{id:'b5',name:'Adyar Hospital',city:'Chennai'},{id:'b6',name:'Porur Hospital',city:'Chennai'}], departments:['general','ent','gyn','ped','ortho','diab','cardio'], consultationFees:{ general:300, ent:450, gyn:500, ped:400, ortho:600, diab:500, cardio:800 } }
];
export const departments = [
  {id:'general',name:'General Medicine',prefix:'G'}, {id:'ent',name:'ENT',prefix:'ENT'}, {id:'gyn',name:'Gynecology',prefix:'GYN'}, {id:'ped',name:'Pediatrics',prefix:'PED'}, {id:'ortho',name:'Orthopedics',prefix:'ORT'}, {id:'diab',name:'Diabetology',prefix:'DIA'}, {id:'cardio',name:'Cardiology',prefix:'CAR'}
];
export const practitioners = [
  {id:'pr1',name:'Dr. Priya',role:'Doctor',specialty:'General Medicine / Pediatrics / Diabetology',departmentId:'general',departmentIds:['general','ped','diab'],user:'priya@medizinhub.com',employeeId:'EMP-001',incomeAccount:'Consultation - General',feeOverrides:{c1:200,c2:250,c3:300}},
  {id:'pr2',name:'Dr. Nithya',role:'Doctor',specialty:'ENT',departmentId:'ent',user:'nithya@medizinhub.com',employeeId:'EMP-002',incomeAccount:'Consultation - ENT',feeOverrides:{c2:350,c3:450}},
  {id:'pr3',name:'Dr. Shalini',role:'Doctor',specialty:'Gynecology',departmentId:'gyn',user:'shalini@medizinhub.com',employeeId:'EMP-003',incomeAccount:'Consultation - Gynecology',feeOverrides:{c2:400,c3:500}},
  {id:'pr4',name:'Dr. Karthik',role:'Doctor',specialty:'Pediatrics',departmentId:'ped',user:'karthik@medizinhub.com',employeeId:'EMP-004',incomeAccount:'Consultation - Pediatrics',feeOverrides:{c2:300,c3:400}},
  {id:'pr5',name:'Dr. Arun',role:'Doctor',specialty:'Orthopedics',departmentId:'ortho',user:'arun@medizinhub.com',employeeId:'EMP-005',incomeAccount:'Consultation - Ortho',feeOverrides:{c3:600}},
  {id:'pr6',name:'Dr. Meena',role:'Doctor',specialty:'Diabetology',departmentId:'diab',user:'meena@medizinhub.com',employeeId:'EMP-006',incomeAccount:'Consultation - Diab',feeOverrides:{c3:500}},
  {id:'pr7',name:'Nurse Kavitha',role:'Nurse',specialty:'IP Nursing',departmentId:'general',user:'kavitha@medizinhub.com',employeeId:'EMP-021',incomeAccount:'Nursing Services',feeOverrides:{}},
  {id:'pr8',name:'Lab Tech Suresh',role:'Technician',specialty:'Diagnostics',departmentId:'general',user:'suresh@medizinhub.com',employeeId:'EMP-031',incomeAccount:'Lab Income',feeOverrides:{}}
];
export const schedules = [
  {id:'sch1',practitionerId:'pr1',branchId:'b1',days:'Mon-Sat',timing:'09:00 AM - 01:00 PM',holiday:'Sunday',slots:24},
  {id:'sch2',practitionerId:'pr2',branchId:'b2',days:'Mon/Wed/Fri',timing:'05:00 PM - 08:00 PM',holiday:'Tuesday',slots:18},
  {id:'sch3',practitionerId:'pr3',branchId:'b4',days:'Mon-Sat',timing:'10:00 AM - 02:00 PM',holiday:'Sunday',slots:20},
  {id:'sch4',practitionerId:'pr5',branchId:'b4',days:'Tue/Thu/Sat',timing:'04:00 PM - 07:00 PM',holiday:'Monday',slots:16}
];
export const initialPatients = [
 {id:'PAT-0001',name:'Ramesh Kumar',age:54,gender:'Male',mobile:'9876543210',guardian:'',guardianMobile:'',area:'Chromepet',blood:'B+',allergies:'Penicillin',medicalHistory:'Diabetes for 6 years',status:'Active',patientType:'OP'},
 {id:'PAT-0002',name:'Lakshmi Devi',age:61,gender:'Female',mobile:'9876543210',guardian:'Family Mobile',guardianMobile:'9876543210',area:'Chromepet',blood:'O+',allergies:'None',medicalHistory:'Knee pain, hypertension',status:'Active',patientType:'OP'},
 {id:'PAT-0003',name:'Kavin S',age:7,gender:'Male',mobile:'',guardian:'Ramesh Kumar',guardianMobile:'9876543210',area:'Chromepet',blood:'A+',allergies:'None',medicalHistory:'Child fever history',status:'Active',patientType:'OP'},
 {id:'PAT-0004',name:'Fatima Banu',age:44,gender:'Female',mobile:'',guardian:'Husband',guardianMobile:'',area:'Tambaram',blood:'AB+',allergies:'Sulfa',medicalHistory:'Gynecology observation',status:'Admitted',patientType:'IP'}
];
export const initialAppointments = [
 {id:'A1',clinicId:'c1',branchId:'b1',token:'G001',tokenType:'Normal',priority:2,patientId:'PAT-0001',patient:'Ramesh Kumar',departmentId:'general',doctorId:'pr1',doctor:'Dr. Priya',time:'09:30 AM',status:'Scheduled',queueStatus:'In Queue',fee:200,visitType:'OP'},
 {id:'A2',clinicId:'c1',branchId:'b1',token:'G-E01',tokenType:'Emergency',priority:1,patientId:'PAT-0002',patient:'Lakshmi Devi',departmentId:'general',doctorId:'pr1',doctor:'Dr. Priya',time:'09:40 AM',status:'Scheduled',queueStatus:'Emergency Queue',fee:200,visitType:'OP'},
 {id:'A3',clinicId:'c2',branchId:'b2',token:'ENT001',tokenType:'Normal',priority:2,patientId:'PAT-0003',patient:'Kavin S',departmentId:'ent',doctorId:'pr2',doctor:'Dr. Nithya',time:'10:00 AM',status:'Seen',queueStatus:'Completed',fee:350,visitType:'OP'},
 {id:'A4',clinicId:'c3',branchId:'b4',token:'GYN001',tokenType:'Normal',priority:2,patientId:'PAT-0004',patient:'Fatima Banu',departmentId:'gyn',doctorId:'pr3',doctor:'Dr. Shalini',time:'10:15 AM',status:'Billed',queueStatus:'IP Ward',fee:500,visitType:'IP'}
];
export const encounters = [
 {id:'ENC-001',patientId:'PAT-0001',date:'2026-04-27',doctor:'Dr. Priya',complaints:'Fever and body pain',assessment:'Viral fever',procedure:'Nebulization not required',preTreatment:'Vitals checked',postTreatment:'Advised hydration'},
 {id:'ENC-002',patientId:'PAT-0002',date:'2026-04-25',doctor:'Dr. Arun',complaints:'Knee tightness',assessment:'Post-op stiffness',procedure:'Physio review',preTreatment:'Pain scale assessed',postTreatment:'Exercises explained'}
];
export const initialIpAdmissions = [{id:'IP-1001',clinicId:'c3',branchId:'b4',patientId:'PAT-0004',patient:'Fatima Banu',departmentId:'gyn',ward:'Private Room',bed:'PR-07',doctor:'Dr. Shalini',admissionDate:'2026-04-27',status:'Admitted',reason:'Observation'}];
export const labOrders = [{id:'LAB-1001',patientId:'PAT-0001',patient:'Ramesh Kumar',tests:'CBC, FBS',status:'Sample Pending',amount:650},{id:'LAB-1002',patientId:'PAT-0002',patient:'Lakshmi Devi',tests:'X-Ray Knee',status:'Result Ready',amount:900}];
export const prescriptions = [{id:'RX-001',patientId:'PAT-0001',patient:'Ramesh Kumar',doctor:'Dr. Priya',medicine:'Paracetamol 500mg',dosage:'1-0-1 after food',days:3},{id:'RX-002',patientId:'PAT-0002',patient:'Lakshmi Devi',doctor:'Dr. Arun',medicine:'Calcium + Vitamin D3',dosage:'0-0-1',days:30}];
export const invoices = [{id:'INV-1001',patient:'Ramesh Kumar',items:'Consultation + Lab',amount:850,status:'Paid'},{id:'INV-1002',patient:'Lakshmi Devi',items:'Consultation + Pharmacy',amount:1250,status:'Pending'}];
export const subscriptions = [{id:'SUB-BASIC',name:'Clinic Basic',price:'₹4,999/mo',features:['Patient','Appointment','Billing']},{id:'SUB-SMART',name:'Polyclinic Smart',price:'₹8,999/mo',features:['Multi Doctor','Lab','Department Queue']},{id:'SUB-PREMIUM',name:'Hospital Premium',price:'₹14,999/mo',features:['IP','Multi Branch','Reports','Pharmacy']}];
export const doctorFeeSettings = [
  {id:'DFS-001',clinicId:'c1',doctorId:'pr1',departmentId:'general',opFee:200,ipFixedFee:500,ipPercentage:10,onlineFee:150,homeVisitFee:1200,incomeAccount:'Consultation - General'},
  {id:'DFS-002',clinicId:'c2',doctorId:'pr2',departmentId:'ent',opFee:350,ipFixedFee:800,ipPercentage:12,onlineFee:250,homeVisitFee:1500,incomeAccount:'Consultation - ENT'},
  {id:'DFS-003',clinicId:'c2',doctorId:'pr3',departmentId:'gyn',opFee:400,ipFixedFee:900,ipPercentage:12,onlineFee:300,homeVisitFee:1800,incomeAccount:'Consultation - Gynecology'},
  {id:'DFS-004',clinicId:'c3',doctorId:'pr1',departmentId:'general',opFee:300,ipFixedFee:700,ipPercentage:10,onlineFee:250,homeVisitFee:1500,incomeAccount:'Consultation - General'},
  {id:'DFS-005',clinicId:'c3',doctorId:'pr3',departmentId:'gyn',opFee:500,ipFixedFee:1200,ipPercentage:15,onlineFee:400,homeVisitFee:2200,incomeAccount:'Consultation - Gynecology'},
  {id:'DFS-006',clinicId:'c3',doctorId:'pr5',departmentId:'ortho',opFee:600,ipFixedFee:1500,ipPercentage:15,onlineFee:500,homeVisitFee:2500,incomeAccount:'Consultation - Ortho'},
  {id:'DFS-007',clinicId:'c3',doctorId:'pr6',departmentId:'diab',opFee:500,ipFixedFee:1000,ipPercentage:10,onlineFee:400,homeVisitFee:2000,incomeAccount:'Consultation - Diab'}
];
export const scanCatalog = [
  {id:'SCAN-XRAY',name:'X-Ray',amount:900},
  {id:'SCAN-USG',name:'Ultrasound Scan',amount:1800},
  {id:'SCAN-ECG',name:'ECG',amount:500},
  {id:'SCAN-CT',name:'CT Scan',amount:4500}
];
export const labCatalog = [
  {id:'LAB-CBC',name:'CBC',amount:350},
  {id:'LAB-FBS',name:'FBS',amount:150},
  {id:'LAB-HBA1C',name:'HbA1c',amount:500},
  {id:'LAB-LFT',name:'LFT',amount:800},
  {id:'LAB-THY',name:'Thyroid Profile',amount:700}
];
export const medicineCatalog = [
  {id:'MED-PARA',name:'Paracetamol 500mg',amount:30},
  {id:'MED-AMOX',name:'Amoxicillin 500mg',amount:120},
  {id:'MED-CALD3',name:'Calcium + D3',amount:220},
  {id:'MED-PPI',name:'Pantoprazole 40mg',amount:90}
];
