import { ReviewSection } from "./ReviewSection";
import { Badge } from "@/app/components/common/ui";

export function OnboardingReview({ draft, validSteps, steps, onEdit }: any) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {steps.slice(0, 5).map((label: string, index: number) => (
          <div
            key={label}
            className={`rounded-2xl border p-4 ${validSteps[index] ? "border-success-border bg-success-subtle" : "border-danger-border bg-danger-subtle"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] lg:text-xs font-bold uppercase text-slate-500">
                  Step {index + 1}
                </p>
                <p className="font-bold text-base lg:text-lg">{label}</p>
              </div>
              <Badge tone={validSteps[index] ? "green" : "red"} className="normal-badge">
                {validSteps[index] ? "Complete" : "Missing"}
              </Badge>
              </div>
              <button
              type="button"
              onClick={() => onEdit(index)}
              className="mt-3 rounded-lg px-2 py-2 lg:px-4 lg:py-3 text-[10px] lg:text-xs bg-white border font-bold"
            >
              Edit Step
            </button>
          </div>
        ))}
      </div>
      <ReviewSection
        title="1. Tenant"
        onEdit={() => onEdit(0)}
        rows={[
          ["Tenant Name", draft.name || "Missing"],
          ["Legal Name", draft.legalName || "-"],
          ["Tenant Type", draft.tenantTypeLabel],
          ["Status", draft.status],
          ["Logo", draft.logoName],
          ["Email", draft.email || "-"],
          ["Phone", draft.phone || "-"],
          ["Country", draft.country],
          ["Timezone", draft.timezone],
          ["Address", draft.address || "-"],
          ["Description", draft.description || "-"],
        ]}
      />
      <ReviewSection
        title="2. Plan & Branches"
        onEdit={() => onEdit(1)}
        rows={[
          ["Subscription Plan", draft.planName],
          [
            "Branches",
            `${draft.branches.length} branch${draft.branches.length === 1 ? "" : "es"}`,
          ],
          ...draft.branches.map((branch: any, index: number) => [
            `Branch ${index + 1}`,
            [
              branch.name || "Missing name",
              branch.code || "Missing code",
              branch.area,
              branch.city,
              branch.state,
            ]
              .filter(Boolean)
              .join(" · "),
          ]),
        ]}
      />
      <ReviewSection
        title="3. Modules"
        onEdit={() => onEdit(2)}
        rows={[
          [
            "Enabled Modules",
            draft.moduleLabels.length
              ? draft.moduleLabels.join(", ")
              : "No modules selected",
          ],
        ]}
      />
      <ReviewSection
        title="4. Templates"
        onEdit={() => onEdit(3)}
        rows={[
          [
            "Roles",
            draft.roleTemplates.length
              ? draft.roleTemplates.join(", ")
              : "None selected",
          ],
          [
            "Medical Departments",
            draft.departmentTemplates.length
              ? draft.departmentTemplates.join(", ")
              : "None selected",
          ],
          [
            "Branch Templates",
            draft.branchTemplates.length
              ? draft.branchTemplates.join(", ")
              : "None selected",
          ],
        ]}
      />
      <ReviewSection
        title="5. Admin User"
        onEdit={() => onEdit(4)}
        rows={[
          ["Admin Name", draft.adminName || "Missing"],
          ["Admin Email", draft.adminEmail || "Missing"],
          ["Temporary Password", draft.adminPassword ? "Set" : "Missing"],
          ["Mobile", draft.adminMobile || "-"],
          ["Must Change Password", draft.adminMustChangePassword],
        ]}
      />
    </div>
  );
}
