export const demoUsers = [
  ['super_admin', 'Super Admin', 'All tenants'],
  ['tenant_admin', 'Tenant Admin', 'Current tenant'],
  ['reception', 'Reception Staff', 'Appointments and queue'],
  ['doctor', 'Doctor', 'Consultation workspace'],
  ['lab', 'Lab Technician', 'Lab workflow'],
  ['pharmacy', 'Pharmacy User', 'Prescription workflow'],
  ['billing', 'Billing Staff', 'Invoice and payments'],
  ['back_office', 'Back Office', 'Reports and settlements'],
] as const;

export const loginPresets: Record<string, {email: string; password: string; needsTenant: boolean}> = {
  super_admin: {email: 'super.admin@demo.medizinhub.local', password: 'SuperPass123', needsTenant: false},
  tenant_admin: {email: 'tenant.admin@demo.medizinhub.local', password: 'DemoPass123', needsTenant: true},
  reception: {email: 'reception@demo.medizinhub.local', password: 'DemoUser123', needsTenant: true},
  doctor: {email: 'doctor@demo.medizinhub.local', password: 'DemoUser123', needsTenant: true},
  lab: {email: 'lab@demo.medizinhub.local', password: 'DemoUser123', needsTenant: true},
  pharmacy: {email: 'pharmacy@demo.medizinhub.local', password: 'DemoUser123', needsTenant: true},
  billing: {email: 'billing@demo.medizinhub.local', password: 'DemoUser123', needsTenant: true},
  back_office: {email: 'backoffice@demo.medizinhub.local', password: 'DemoUser123', needsTenant: true},
};
