type PageLoaderProps = {
  visible: boolean;
  text?: string;
};

export function PageLoader({ visible, text = "Loading..." }: PageLoaderProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-lg bg-white px-6 py-5 shadow-lg">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600" />
        <p className="text-sm font-medium text-slate-700">{text}</p>
      </div>
    </div>
  );
}
