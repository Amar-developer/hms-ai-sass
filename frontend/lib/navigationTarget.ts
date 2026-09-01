export type AppNavigationTarget =
  | string
  | {
      id: string;
      section?: string;
      appointmentId?: string;
    };
