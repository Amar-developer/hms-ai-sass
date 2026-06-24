"use client";

export function ModuleEntitlementChecklist({ modules, selected = [] }: any) {
  const selectedSet = new Set(selected);
  const grouped = (modules || []).reduce((acc: any, module: any) => {
    const category = String(module.category || "modules");
    acc[category] = [...(acc[category] || []), module];
    return acc;
  }, {});
  const categories = Object.keys(grouped).sort();
  return (
    <div>
      <p className="mb-2 text-sm font-bold text-slate-700">Enabled Modules</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => (
          <div
            key={category}
            className="rounded-2xl border border-slate-200 p-3"
          >
            <p className="mb-2 text-xs font-bold uppercase text-slate-500">
              {category.replaceAll("_", " ")}
            </p>
            <div className="grid gap-2">
              {grouped[category].map((module: any) => (
                <label
                  key={module.entitlement_key}
                  className="flex cursor-pointer items-start gap-2 rounded-xl p-2 text-sm hover:bg-slate-50"
                >
                  <input
                    name="enabledModules"
                    type="checkbox"
                    value={module.entitlement_key}
                    defaultChecked={selectedSet.has(module.entitlement_key)}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <span className="font-semibold">{module.name}</span>
                    <span className="block text-xs text-slate-500">
                      {module.entitlement_key}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
