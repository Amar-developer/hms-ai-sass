export const demoUsers = [
  ['super_admin',       'Super Admin',       'All tenants'],
  ['tenant_admin',      'Tenant Admin',      'Current tenant'],
  ['receptionist',      'Receptionist',      'Appointments and queue'],
  ['doctor_gen',        'General Medicine',  'Consultation workspace'],
  ['doctor_ped',        'Pediatrics',        'Consultation workspace'],
  ['doctor_derm',       'Dermatology',       'Consultation workspace'],
  ['doctor_ent',        'ENT',               'Consultation workspace'],
  ['doctor_ortho',      'Orthopedics',       'Consultation workspace'],
  ['lab_technician',    'Lab Technician',    'Lab workflow'],
  ['pharmacist',        'Pharmacist',        'Prescription workflow'],
  ['billing_executive', 'Billing Executive', 'Invoice and payments'],
  ['ward_coordinator',  'Ward Coordinator',  'Reports and settlements'],
] as const;

export const loginPresets: Record<
  string,
  { email: string; password: string; needsTenant: boolean }
 > = {

  super_admin: {
    email:       'karthik.narayanan@medizinhub.io',
    password:    'Sunrise@Super1',
    needsTenant: false,
  },

  // ── Tenant 1: Sunrise Multispeciality Clinic ──────────────────────────────
  tenant_admin: {
    email:       'linuxuser206@gmail.com',
    password:    'Tenant@Admin1',
    needsTenant: true,
  },

  // Staff – Sunrise Main Centre (SUN-MAIN)
  receptionist: {
    email:       'lavanya.kannan@sunrise.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },
  lab_technician: {
    email:       'durai.murugan@sunrise.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },
  pharmacist: {
    email:       'sumathi.rajagopalan@sunrise.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },
  billing_executive: {
    email:       'balaji.sundaresan@sunrise.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },
  ward_coordinator: {
    email:       'indira.selvakumar@sunrise.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },

  // Doctors – Sunrise Main Centre (SUN-MAIN)
  doctor_gen: {
    email:       'arjun.krishnamurthy@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_gen_2: {
    email:       'meena.parthasarathy@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_ped: {
    email:       'vijay.balakrishnan@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_ped_2: {
    email:       'nalini.subramaniam@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_derm: {
    email:       'deepa.raghunathan@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_derm_2: {
    email:       'sanjay.iyer@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_ent: {
    email:       'kavitha.annamalai@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_ent_2: {
    email:       'murugan.selvam@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_ortho: {
    email:       'balamurugan.natarajan@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_ortho_2: {
    email:       'saranya.chandrasekhar@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },

  // Staff – Sunrise North Wing (SUN-NORTH)
  receptionist_north: {
    email:       'nirmala.krishnaswamy@sunrise.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },
  lab_technician_north: {
    email:       'senthilnathan.rajan@sunrise.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },
  pharmacist_north: {
    email:       'priya.natarajan@sunrise.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },
  billing_executive_north: {
    email:       'madhavan.chandran@sunrise.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },
  ward_coordinator_north: {
    email:       'vasantha.raghavan@sunrise.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },

  // Doctors – Sunrise North Wing (SUN-NORTH)
  doctor_gen_north: {
    email:       'prakash.venkatesh@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_gen_north_2: {
    email:       'usha.ramachandran@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_ped_north: {
    email:       'gowri.shankar@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_ped_north_2: {
    email:       'kalpana.muthusamy@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_derm_north: {
    email:       'harish.subramanian@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_derm_north_2: {
    email:       'revathi.gopalakrishnan@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_ent_north: {
    email:       'senthil.kumarraj@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_ent_north_2: {
    email:       'asha.krishnan@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_ortho_north: {
    email:       'dinesh.balaji@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_ortho_north_2: {
    email:       'poorni.suresh@sunrise.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },

  // ── Tenant 2: BlueCross Hospitals Pvt Ltd ────────────────────────────────
  tenant_admin_bluecross: {
    email:       'rajesh.venkataraman@bluecrosshospitals.in',
    password:    'Tenant@Admin1',
    needsTenant: true,
  },

  // Staff – BlueCross City Hospital (BLU-CITY)
  receptionist_blucity: {
    email:       'elamathi.subramaniam@bluecross.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },
  lab_technician_blucity: {
    email:       'vinothkumar.perumal@bluecross.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },
  pharmacist_blucity: {
    email:       'lakshmi.narayanan@bluecross.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },
  billing_executive_blucity: {
    email:       'gopalakrishnan.iyer@bluecross.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },
  ward_coordinator_blucity: {
    email:       'tamilarasi.pandian@bluecross.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },

  // Doctors – BlueCross City Hospital (BLU-CITY)
  doctor_cardio_blucity: {
    email:       'anand.subramanian@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_cardio_blucity_2: {
    email:       'sudha.rajendran@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_neuro_blucity: {
    email:       'manoj.pillai@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_neuro_blucity_2: {
    email:       'chithra.narayanan@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_onco_blucity: {
    email:       'ravi.reddy@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_onco_blucity_2: {
    email:       'lalitha.srinivasan@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_nephro_blucity: {
    email:       'sundaram.venugopal@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_nephro_blucity_2: {
    email:       'gayathri.ramasamy@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_pulmo_blucity: {
    email:       'krishnakumar.iyer@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_pulmo_blucity_2: {
    email:       'padmavathi.nair@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },

  // Staff – BlueCross Suburban Clinic (BLU-SUB)
  receptionist_blusub: {
    email:       'manimegalai.arumugam@bluecross.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },
  lab_technician_blusub: {
    email:       'selvakumar.thangavel@bluecross.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },
  pharmacist_blusub: {
    email:       'rohini.venkatraman@bluecross.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },
  billing_executive_blusub: {
    email:       'balachandran.pillai@bluecross.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },
  ward_coordinator_blusub: {
    email:       'annapoorani.sundaram@bluecross.medizinhub.io',
    password:    'Staff@Pass1',
    needsTenant: true,
  },

  // Doctors – BlueCross Suburban Clinic (BLU-SUB)
  doctor_cardio_blusub: {
    email:       'venkat.raghavan@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_cardio_blusub_2: {
    email:       'nithya.kumaravel@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_neuro_blusub: {
    email:       'saravanan.murugesan@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_neuro_blusub_2: {
    email:       'bhavani.suresh@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_onco_blusub: {
    email:       'ramkumar.selvadurai@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_onco_blusub_2: {
    email:       'mythili.krishnamoorthy@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_nephro_blusub: {
    email:       'sureshbabu.pillai@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_nephro_blusub_2: {
    email:       'vanitha.anand@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_pulmo_blusub: {
    email:       'thiyagarajan.perumal@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
  doctor_pulmo_blusub_2: {
    email:       'hemapriya.doss@bluecross.medizinhub.io',
    password:    'Doctor@Pass1',
    needsTenant: true,
  },
};
