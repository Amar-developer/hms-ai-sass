import { Button } from "@/app/components/common/ui";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";

export function Actions({ busy, back, disabled, label }: any) {
  return (
    <div className="flex flex-wrap gap-2 md:col-span-2">
      <Button disabled={busy || disabled} className="save-button">
        <ButtonLoader loading={busy}>
          {busy ? "Saving..." : label}
        </ButtonLoader>
      </Button>
      <button
        type="button"
        onClick={back}
        className="close-button border font-bold"
      >
        Cancel
      </button>
    </div>
  );
}
