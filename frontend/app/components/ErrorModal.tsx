"use-client";
import { AlertCircle, X } from "lucide-react";

type ErrorModelProps = {
  open: Boolean;
  message: String;
  onClose: () => void;
};

const ErrorModal = ({ open, message, onClose }: ErrorModelProps) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-red-100 p-2 text-red-600">
              <AlertCircle size={22} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">Error</h2>

              <p className="mt-1 text-sm text-slate-600">{message}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorModal;
