import { Tab } from "./Tab";
export function Header({ view, setView }: any) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between bg-white p-3 rounded-lg">
      <div>
        <h3 className="card-title font-bold">Physiotherapy</h3>
        <p className="card-desc text-slate-500">
          OP/IP assessment, electrotherapy, rehab sessions, equipment usage,
          progress, and billing.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Tab
          active={view === "list" || view === "detail"}
          onClick={() => setView("list")}
        >
          Cases
        </Tab>
        <Tab active={view === "op"} onClick={() => setView("op")}>
          OP Case
        </Tab>
        <Tab active={view === "ip"} onClick={() => setView("ip")}>
          IP Case
        </Tab>
      </div>
    </div>
  );
}
