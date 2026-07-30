import { ApiSession } from "@/lib/api";

export type Props = {
  clinic: any;
  branchId: string;
  departmentId: string;
  setDepartmentId: (value: string) => void;
  allowedDepartments: any[];
  patients: any[];
  setPatients: (value: any[]) => void;
  appointments: any[];
  setAppointments: (value: any[]) => void;
  apiSession: ApiSession | null;
  loadLiveData: (session: ApiSession) => Promise<void>;
  setActive?: (page: string) => void;
  isInitialLoading?: boolean;
};

export type BookingStep = "appointment" | "newPatient" | "success";
