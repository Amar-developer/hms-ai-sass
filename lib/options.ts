export function normalizeOptionLabel(value:any){
  return String(value||'').trim().replace(/\s+/g,' ').toLowerCase();
}

export function uniqueDepartmentRows<T extends {id?:string;name?:string;code?:string;is_active?:boolean}>(rows:T[], preferredId=''){
  const byLabel=new Map<string,T>();
  for(const row of rows||[]){
    const label=normalizeOptionLabel(row.name||row.code||row.id);
    if(!label)continue;
    const existing=byLabel.get(label);
    if(!existing){
      byLabel.set(label,row);
      continue;
    }
    if(preferredId&&row.id===preferredId){
      byLabel.set(label,row);
      continue;
    }
    if(existing.is_active===false&&row.is_active!==false){
      byLabel.set(label,row);
    }
  }
  return Array.from(byLabel.values());
}
