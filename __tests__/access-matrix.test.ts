import {describe,expect,it} from 'vitest';
import {canOpenModule} from '../lib/moduleAccess';
import {nav,roleModules} from '../lib/navigation';
import {
  normalizeSidebarModuleMap,
  normalizeSidebarRole,
  resolveSidebarModules,
} from '../lib/sidebarAccess';

const fullClinic={id:'clinic_full',modules:['appointments','patients','practitioners','scheduling','ip','doctor','lab','pharmacy','home_care','billing','subscriptions']};
const starterClinic={id:'clinic_starter',modules:['appointments','patients','practitioners','scheduling','doctor','billing']};

describe('frontend module access matrix',()=>{
  it('keeps every role module mapped to an existing navigation item',()=>{
    const navIds=new Set<string>(nav.map(([id])=>id));
    Object.entries(roleModules).forEach(([role,modules])=>{
      modules.forEach(moduleId=>expect(navIds.has(moduleId), `${role} references ${moduleId}`).toBe(true));
    });
  });

  it('hides disabled tenant modules even when role navigation allows them',()=>{
    expect(canOpenModule('lab',roleModules.tenant_admin,starterClinic)).toBe(false);
    expect(canOpenModule('pharmacy',roleModules.tenant_admin,starterClinic)).toBe(false);
    expect(canOpenModule('ip',roleModules.tenant_admin,starterClinic)).toBe(false);
    expect(canOpenModule('appointments',roleModules.tenant_admin,starterClinic)).toBe(true);
  });

  it('allows module access only when role and clinic entitlement both allow it',()=>{
    expect(canOpenModule('lab',roleModules.lab,fullClinic)).toBe(true);
    expect(canOpenModule('pharmacy',roleModules.lab,fullClinic)).toBe(false);
    expect(canOpenModule('billing',roleModules.billing,fullClinic)).toBe(true);
    expect(canOpenModule('lab',roleModules.billing,fullClinic)).toBe(false);
    expect(canOpenModule('home_care',roleModules.tenant_admin,fullClinic)).toBe(true);
  });

  it('applies reception sidebar overrides to receptionist aliases',()=>{
    const modules=resolveSidebarModules({
      user:{roles:['receptionist'],user_type:'receptionist'},
      fallbackRole:'receptionist',
      defaults:roleModules,
      overrides:{reception:['appointments','queue','patients']},
      permissionModules:['appointments','queue','patients','lab'],
    });
    expect(normalizeSidebarRole('Receptionist')).toBe('reception');
    expect(modules).toEqual(['appointments','queue','patients']);
    expect(modules).not.toContain('lab');
  });

  it('normalizes previously saved sidebar role aliases',()=>{
    expect(normalizeSidebarModuleMap({
      receptionist:['appointments'],
      lab_technician:['lab'],
    })).toEqual({
      reception:['appointments'],
      lab:['lab'],
    });
  });

  it('gates a configured custom tenant role strictly and never leaks via permissions',()=>{
    // Admin configures the tenant's own role from the sidebar dropdown, so the
    // override key matches the role key carried on the user's session. Once
    // configured, the permission-derived fallback must not add extra modules.
    const modules=resolveSidebarModules({
      user:{roles:['lab_technicians'],user_type:'staff'},
      fallbackRole:'lab_technicians',
      defaults:roleModules,
      overrides:{lab_technicians:['patients','lab']},
      permissionModules:['patients','lab','billing','admin'],
    });
    expect(modules).toEqual(['patients','lab']);
    expect(modules).not.toContain('billing');
    expect(modules).not.toContain('admin');
  });

  it('does not grant tenant admin modules to unknown custom roles',()=>{
    const modules=resolveSidebarModules({
      user:{roles:['front_desk_custom'],user_type:'staff'},
      fallbackRole:'front_desk_custom',
      defaults:roleModules,
      overrides:{},
      permissionModules:['appointments','patients'],
    });
    expect(modules).toEqual(['appointments','patients']);
    expect(modules).not.toContain('lab');
    expect(modules).not.toContain('admin');
  });
});
