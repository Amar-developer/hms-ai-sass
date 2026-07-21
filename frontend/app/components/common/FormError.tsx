type FormErrorProps = {
  error?: string;
};
export function FormError({ error }: FormErrorProps) {
  if (!error) return null;

  return <p className="mt-1 text-xs text-red-500">{error}</p>;
}
