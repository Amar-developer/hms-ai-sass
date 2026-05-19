import {isModuleEnabled} from './hmsLogic';

export function canOpenModule(id: string, roleAllowedModules: string[], clinic: any) {
  return (
    roleAllowedModules.includes(id) &&
    (id === 'dashboard' ||
      id === 'queue' ||
      id === 'reports' ||
      id === 'items' ||
      id === 'admin' ||
      id === 'superadmin' ||
      isModuleEnabled(clinic, id))
  );
}
