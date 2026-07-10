import { FormField } from "@/app/components/FormElements";
import { Input } from "@/app/components/common/ui";
import { today } from "@/utils/helper";
export function CaseFields() {
  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <FormField label="Body Region">
          <Input
            name="body_region"
            placeholder="Knee, shoulder, lumbar spine"
          />
        </FormField>
        <FormField label="Pain Score">
          <Input name="pain_score" type="number" min="0" max="10" />
        </FormField>
        <FormField label="Assessment Date">
          <Input name="assessment_date" type="date" defaultValue={today()} />
        </FormField>
      </div>
      <FormField label="Condition">
        <Input
          name="condition"
          placeholder="Chronic pain, post-surgery, sports injury, arthritis"
        />
      </FormField>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Range Of Motion">
          <Input name="range_of_motion" />
        </FormField>
        <FormField label="Muscle Strength">
          <Input name="muscle_strength" />
        </FormField>
      </div>
      <FormField label="Treatment Goal">
        <Input
          name="treatment_goal"
          placeholder="Pain relief, mobility, strengthening, joint rehabilitation"
        />
      </FormField>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Planned Sessions">
          <Input
            name="planned_sessions"
            type="number"
            min="1"
            defaultValue="6"
          />
        </FormField>
        <FormField label="Frequency">
          <Input name="frequency" placeholder="Daily / 3 days per week" />
        </FormField>
      </div>
    </>
  );
}
