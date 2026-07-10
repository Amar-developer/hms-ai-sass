import { ApiSession } from "@/lib/api";

export type TokenQueueProps = {
  scopedAppointments: any[];
  appointments: any[];
  setAppointments: (value: any[]) => void;
  apiSession: ApiSession | null;
  loadLiveData: (session: ApiSession) => Promise<void>;
  departmentId: string;
  doctorScope?: any;
  setActive?: (page: string) => void;
};

export type QueueAction = "call" | "skip" | "requeue" | "cancel";
