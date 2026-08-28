import { BrandLoader } from "./BrandLoader";

type PageLoaderProps = {
  label?: string;
  fullScreen?: boolean;
  size?: number;
  color?: string;
};

export function PageLoader({
  label,
  fullScreen = true,
}: PageLoaderProps) {
  return (
    <BrandLoader
      label={label || "Loading MedizinHub HMS"}
      fullScreen={fullScreen}
    />
  );
}
