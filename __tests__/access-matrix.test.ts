import {describe,expect,it} from 'vitest';
import {canOpenModule} from '../lib/moduleAccess';
import {nav,roleModules} from '../lib/navigation';

const fullClinic={id:'clinic_full',modules:['appointments','patients','practitioners','scheduling','ip','doctor','lab','pharmacy','billing','subscriptions']};
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
  });
});
