
export function IPHeader({ view, setView }: any) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h3 className="card-title font-bold">IP Management</h3>
        <p className="card-desc text-slate-500">
          OP to IP conversion, direct admission, treatments, consent, discharge
          summary, and IP billing.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => setView("list")}
          className={`rounded-lg px-2 py-2 text-sm font-bold ${view === "list" || view === "detail" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
        >
          Admissions
        </button>
        <button
          type="button"
          onClick={() => setView("convert")}
          className={`rounded-lg px-4 py-3 text-sm font-bold ${view === "convert" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
        >
          Convert OP to IP
        </button>
        <button
          type="button"
          onClick={() => setView("direct")}
          className={`rounded-lg px-4 py-3 text-sm font-bold ${view === "direct" ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
        >
          Direct Admission
        </button>
      </div>
    </div>
  );
}
