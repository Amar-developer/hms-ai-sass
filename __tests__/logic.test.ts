import {describe,expect,it} from 'vitest';
import {generatePatientId,generateToken,searchPatients} from '../lib/hmsLogic';
import {initialPatients} from '../lib/mockData';
describe('HMS logic',()=>{it('searches family mobile and no-mobile patients',()=>{expect(searchPatients(initialPatients,'9876543210').length).toBeGreaterThan(1)});it('generates emergency department token',()=>{expect(generateToken('ent','Emergency',0)).toBe('ENT-E01')});it('generates patient id',()=>{expect(generatePatientId(4)).toBe('PAT-0005')})});
