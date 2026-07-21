import { BookingFormValues } from "./homecare.schema";

export type BookingFormProps = {
  patients: any[];
  services: any[];
  visitServices: any[];
  serviceLoadError: string;
  editing?: any;
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
