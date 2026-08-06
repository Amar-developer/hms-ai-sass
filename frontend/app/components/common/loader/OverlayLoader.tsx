import { Spinner } from "./Spinner";

export function OverlayLoader() {
  return (
    <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center rounded-xl">
      <Spinner />
    </div>
  );
}
