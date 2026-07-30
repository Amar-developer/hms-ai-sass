import { ApiSession } from "@/lib/api";

export type TokenQueueProps = {
  apiSession: ApiSession | null;
  clinic: { id: string };
  branchId: string;
  patients: any[];
  departmentId: string;
  doctorScope?: any;
  setActive?: (page: string) => void;
};

export type QueueAction = "call" | "skip" | "requeue" | "cancel";
