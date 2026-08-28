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
    <span
      className={`inline-flex items-center justify-center gap-2 ${
        loading ? "w-full" : ""
      }`}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </span>
  );
}
