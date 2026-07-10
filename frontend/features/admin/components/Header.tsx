export function Header({ title, subtitle, back }: any) {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <div>
        <h3 className="card-title font-bold">{title}</h3>
        <p className="card-desc text-slate-500">{subtitle}</p>
      </div>
      <button type="button" onClick={back} className="close-button font-bold">
        Back
      </button>
    </div>
  );
}
