import { ApiSession } from "@/lib/api";
import type { AppNavigationTarget } from "@/lib/navigationTarget";

export type TokenQueueProps = {
  apiSession: ApiSession | null;
  clinic: { id: string };
  branchId: string;
  patients: any[];
  departmentId: string;
  doctorScope?: any;
  setActive?: (page: AppNavigationTarget) => void;
};

export type QueueAction = "call" | "skip" | "requeue" | "cancel";
