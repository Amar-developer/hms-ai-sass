export function Card({children,className=''}:{children:React.ReactNode,className?:string}){return <div className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>}
export function Badge({children,tone='slate'}:{children:React.ReactNode,tone?:'slate'|'red'|'green'|'blue'|'amber'|'purple'}){const m:any={slate:'bg-slate-100 text-slate-700',red:'bg-red-100 text-red-700',green:'bg-emerald-100 text-emerald-700',blue:'bg-blue-100 text-blue-700',amber:'bg-amber-100 text-amber-700',purple:'bg-purple-100 text-purple-700'};return <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${m[tone]}`}>{children}</span>}
export function Field({label,children}:{label:string,children:React.ReactNode}){return <label className="block"><span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>{children}</label>}
function submitNearestFormOnEnter(event:any){
  const control=event.currentTarget;
  if(control.form){
    control.form.requestSubmit();
    return;
  }
  const actionPattern=/^(save|add|create|update|assign|link|book|release|submit|return expired)/i;
  const excludePattern=/cancel|close|back|delete|remove|deactivate|pdf|view|edit|new /i;
  for(let node=control.parentElement;node&&node!==document.body;node=node.parentElement){
    const actions=Array.from(node.querySelectorAll('button')).filter((button:any)=>{
      const label=String(button.textContent||'').trim();
      return !button.disabled&&actionPattern.test(label)&&!excludePattern.test(label);
    }) as any[];
    if(actions.length===1){
      actions[0].click();
      return;
    }
  }
}
export function Input({className='',onKeyDown,...props}:any){return <input {...props} onKeyDown={(event:any)=>{onKeyDown?.(event); if(event.defaultPrevented||event.key!=='Enter'||event.shiftKey||event.altKey||event.ctrlKey||event.metaKey||event.nativeEvent?.isComposing||props.type==='button'||props.type==='checkbox'||props.type==='file'||props.type==='radio'||props.type==='range')return; event.preventDefault(); submitNearestFormOnEnter(event)}} className={`w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-slate-500 ${className}`}/>}
export function Select(props:any){return <select {...props} className={`w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-slate-500 ${props.className||''}`}>{props.children}</select>}
export function Button({children,className='',...props}:any){return <button {...props} className={`rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white disabled:bg-slate-300 ${className}`}>{children}</button>}
export function ActionGroup({children,className=''}:{children:React.ReactNode,className?:string}){return <div className={`flex flex-nowrap items-center justify-end gap-2 whitespace-nowrap ${className}`}>{children}</div>}
export function ActionButton({children,tone='neutral',className='',...props}:any){const tones:any={neutral:'border-slate-200 bg-white text-slate-900 hover:bg-slate-50',primary:'border-slate-900 bg-slate-900 text-white hover:bg-slate-800',danger:'border-red-100 bg-white text-red-600 hover:bg-red-50'};return <button type="button" {...props} className={`inline-flex h-9 shrink-0 items-center justify-center rounded-xl border px-3 text-xs font-bold disabled:border-slate-200 disabled:bg-white disabled:text-slate-300 ${tones[tone]||tones.neutral} ${className}`}>{children}</button>}
