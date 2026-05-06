import {isModuleEnabled} from '@/lib/hmsLogic';

export function canOpenModule(id: string, roleAllowedModules: string[], clinic: any) {
  return (
    roleAllowedModules.includes(id) &&
    (id === 'dashboard' ||
      id === 'queue' ||
      id === 'reports' ||
      id === 'admin' ||
      id === 'superadmin' ||
      isModuleEnabled(clinic, id))
  );
}
