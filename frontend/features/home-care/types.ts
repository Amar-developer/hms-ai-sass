import { BookingFormValues } from "./homecare.schema";
import type { ApiSession } from "@/lib/api";

export type BookingFormProps = {
  apiSession?: ApiSession | null;
  patients: any[];
  services: any[];
  visitServices: any[];
  serviceLoadError: string;
  editing?: any;
  initialBookingType?: "home_care" | "home_visit";
  branchId?: string;
  busy: boolean;
  patientCreateBusy: boolean;
  lineItems: any[];
  setLineItems: (updater: any) => void;
  onCreatePatient: (data: any) => Promise<any>;
  onSubmit: (
    data: BookingFormValues,
  ) => void | boolean | Promise<void | boolean>;
  onCancel: () => void;
};
