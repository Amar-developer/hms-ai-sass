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
    <div className={`${loading ? 'flex ':''}`}>
      {loading && <Spinner size="sm" />}
      {children}
    </div>
  );
}
