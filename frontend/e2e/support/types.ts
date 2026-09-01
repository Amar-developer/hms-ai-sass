import type { ActorName } from "./paths";

export type SeedActor = {
  name: string;
  email: string;
  password: string;
  userId: string;
  roleKeys: string[];
};

export type FrontendSeed = {
  runId: string;
  tenantId: string;
  tenantName: string;
  limitedTenantId: string;
  fullPlanId: string;
  branchId: string;
  branchName: string;
  secondBranchId: string;
  departmentId: string;
  secondDepartmentId: string;
  practitionerId: string;
  patientId: string;
  patientName: string;
  queueEntryId: string;
  consultationId: string;
  invoiceId: string;
  invoiceNumber: string;
  membershipPlanId: string;
  medicineName: string;
  labTestName: string;
  errorLogId: string;
  errorRoute: string;
  actors: Record<ActorName, SeedActor>;
};
