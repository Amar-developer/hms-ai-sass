import { Spinner } from "./Spinner";

interface ButtonLoaderProps {
  loading: boolean;
  children: React.ReactNode;
}

export function ButtonLoader({
  loading,
  children,
}: ButtonLoaderProps) {
  return (
    <div className={`${loading ? 'flex w-full justify-center gap-2':''}`}>
      {loading && <Spinner size="sm" />}
      {children}
    </div>
  );
}
