"use client";

import { useEffect, useState } from "react";

import {
  ActionButton,
  Badge,
  Button,
  Card,
  Input,
  Select,
  StatusToast,
} from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { apiFetch } from "@/lib/api";

const EMPTY_RULE: any = {
  rule_key: "",
  name: "",
  category: "",
  metric_key: "",
  operator: "",
  threshold: "",
  threshold_secondary: "",
  window_days: "",
  flag_key: "",
  severity: "",
  badge_label: "",
  badge_background_color: "",
  badge_text_color: "",
  badge_border_color: "",
  display_as_patient_badge: false,
  priority: "",
  exclusive_group: "",
  required_flag_keys: "",
  expires_after_days: "",
  auto_resolve: false,
  requires_active_membership: false,
  action_enabled: false,
  action_key: "",
  action_channel: "",
  action_template_key: "",
  action_requires_approval: false,
  action_cooldown_days: "",
  is_enabled: false,
};

function optionalNumber(value: any) {
  return value === "" || value == null ? null : Number(value);
}

function rulePayload(rule: any) {
  return {
    ...rule,
    threshold: Number(rule.threshold),
    threshold_secondary: optionalNumber(rule.threshold_secondary),
    window_days: optionalNumber(rule.window_days),
    priority: Number(rule.priority),
    expires_after_days: optionalNumber(rule.expires_after_days),
    action_cooldown_days: optionalNumber(rule.action_cooldown_days),
    badge_label: rule.badge_label || null,
    badge_background_color: rule.badge_background_color || null,
    badge_text_color: rule.badge_text_color || null,
    badge_border_color: rule.badge_border_color || null,
    exclusive_group: rule.exclusive_group || null,
    required_flag_keys: String(rule.required_flag_keys || "")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean),
    action_key: rule.action_key || null,
    action_channel: rule.action_channel || null,
    action_template_key: rule.action_template_key || null,
  };
}

function editableRule(rule: any) {
  return {
    ...EMPTY_RULE,
    ...rule,
    threshold: String(rule.threshold ?? ""),
    threshold_secondary: String(rule.threshold_secondary ?? ""),
    window_days: String(rule.window_days ?? ""),
    expires_after_days: String(rule.expires_after_days ?? ""),
    action_cooldown_days: String(rule.action_cooldown_days ?? ""),
    required_flag_keys: (rule.required_flag_keys || []).join(", "),
  };
}

export function PatientIntelligenceSettings({ apiSession }: any) {
  const [rules, setRules] = useState<any[]>([]);
  const [options, setOptions] = useState<any>({
    metrics: [],
    operators: [],
    categories: [],
    channels: [],
  });
  const [editing, setEditing] = useState<any>(EMPTY_RULE);
  const [editingId, setEditingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    if (!apiSession) return;
    setBusy(true);
    try {
      const [ruleRows, configuration] = await Promise.all([
        apiFetch<any[]>("/patient-intelligence/rules", apiSession),
        apiFetch<any>("/patient-intelligence/configuration-options", apiSession),
      ]);
      setRules(ruleRows || []);
      setOptions(configuration || {});
    } catch (error: any) {
      setMessage(error.message || "Could not load Patient Intelligence settings.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [apiSession?.tenantId]);

  function update(key: string, value: any) {
    setEditing((current: any) => ({ ...current, [key]: value }));
  }

  async function save(event: any) {
    event.preventDefault();
    if (
      editing.action_enabled &&
      (!editing.action_key || !editing.action_channel || !editing.action_template_key)
    ) {
      setMessage(
        "Configured actions need an action key, channel, and template key. Fill them or turn off Create configured action.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const payload: any = rulePayload(editing);
      delete payload.id;
      delete payload.version;
      if (editingId) delete payload.rule_key;
      await apiFetch(
        editingId
          ? `/patient-intelligence/rules/${editingId}`
          : "/patient-intelligence/rules",
        apiSession,
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        },
      );
      setEditing(EMPTY_RULE);
      setEditingId("");
      await load();
      setMessage(editingId ? "Rule updated." : "Rule created.");
    } catch (error: any) {
      setMessage(error.message || "Could not save the rule.");
    } finally {
      setBusy(false);
    }
  }

  async function adaptExistingData() {
    setBusy(true);
    try {
      const result: any = await apiFetch(
        "/patient-intelligence/adapt-existing-data?limit=500",
        apiSession,
        { method: "POST" },
      );
      setMessage(`${result.patients_processed || 0} patient records recalculated.`);
    } catch (error: any) {
      setMessage(error.message || "Could not recalculate existing patients.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <StatusToast message={message} onClose={() => setMessage("")} />
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="card-title font-bold">Patient Intelligence</h3>
            <p className="card-desc text-slate-500">
              Tenant-owned value, behavior, lifecycle, badge, and engagement rules.
              No thresholds or patient categories are created automatically.
            </p>
          </div>
          <ActionButton onClick={adaptExistingData} disabled={busy}>
            Recalculate Existing Patients
          </ActionButton>
        </div>
      </Card>

      <Card>
        <h4 className="font-bold">{editingId ? "Edit Rule" : "Create Rule"}</h4>
        <form onSubmit={save} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FormField label="Rule Key" required>
            <Input value={editing.rule_key} disabled={Boolean(editingId)} onChange={(e: any) => update("rule_key", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} />
          </FormField>
          <FormField label="Rule Name" required><Input value={editing.name} onChange={(e: any) => update("name", e.target.value)} /></FormField>
          <FormField label="Category" required><Select required value={editing.category} onChange={(e: any) => update("category", e.target.value)}><option value="">Select category</option>{options.categories.map((value: string) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</Select></FormField>
          <FormField label="Generated Flag" required><Input value={editing.flag_key} onChange={(e: any) => update("flag_key", e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))} /></FormField>

          <FormField label="Metric" required><Select required value={editing.metric_key} onChange={(e: any) => update("metric_key", e.target.value)}><option value="">Select metric</option>{options.metrics.map((metric: any) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</Select></FormField>
          <FormField label="Operator" required><Select required value={editing.operator} onChange={(e: any) => update("operator", e.target.value)}><option value="">Select operator</option>{options.operators.map((value: string) => <option key={value} value={value}>{value}</option>)}</Select></FormField>
          <FormField label="Threshold" required><Input type="number" step="0.01" value={editing.threshold} onChange={(e: any) => update("threshold", e.target.value)} /></FormField>
          <FormField label="Second Threshold"><Input type="number" step="0.01" disabled={editing.operator !== "between"} value={editing.threshold_secondary} onChange={(e: any) => update("threshold_secondary", e.target.value)} /></FormField>
          <FormField label="Window Days"><Input type="number" min="1" value={editing.window_days} onChange={(e: any) => update("window_days", e.target.value)} /></FormField>
          <FormField label="Severity" required><Input required value={editing.severity} onChange={(e: any) => update("severity", e.target.value)} /></FormField>
          <FormField label="Priority" required><Input required type="number" min="0" value={editing.priority} onChange={(e: any) => update("priority", e.target.value)} /></FormField>
          <FormField label="Exclusive Group"><Input value={editing.exclusive_group} onChange={(e: any) => update("exclusive_group", e.target.value)} placeholder="e.g. patient_value_tier" /></FormField>
          <FormField label="Required Flags"><Input value={editing.required_flag_keys} onChange={(e: any) => update("required_flag_keys", e.target.value)} placeholder="FLAG_ONE, FLAG_TWO" /></FormField>
          <FormField label="Expires After Days"><Input type="number" min="1" value={editing.expires_after_days} onChange={(e: any) => update("expires_after_days", e.target.value)} /></FormField>

          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={editing.requires_active_membership} onChange={(e) => update("requires_active_membership", e.target.checked)} />Require active paid membership</label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={editing.auto_resolve} onChange={(e) => update("auto_resolve", e.target.checked)} />Auto-resolve when unmatched</label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={editing.is_enabled} onChange={(e) => update("is_enabled", e.target.checked)} />Rule enabled</label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={editing.display_as_patient_badge} onChange={(e) => update("display_as_patient_badge", e.target.checked)} />Show beside patient names</label>

          {editing.display_as_patient_badge && <>
            <FormField label="Badge Label" required><Input value={editing.badge_label} onChange={(e: any) => update("badge_label", e.target.value)} /></FormField>
            <FormField label="Background Color" required><Input value={editing.badge_background_color} onChange={(e: any) => update("badge_background_color", e.target.value)} placeholder="#RRGGBB" /></FormField>
            <FormField label="Text Color" required><Input value={editing.badge_text_color} onChange={(e: any) => update("badge_text_color", e.target.value)} placeholder="#RRGGBB" /></FormField>
            <FormField label="Border Color" required><Input value={editing.badge_border_color} onChange={(e: any) => update("badge_border_color", e.target.value)} placeholder="#RRGGBB" /></FormField>
          </>}

          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={editing.action_enabled} onChange={(e) => update("action_enabled", e.target.checked)} />Create configured action</label>
          {editing.action_enabled && <>
            <FormField label="Action Key" required><Input value={editing.action_key} onChange={(e: any) => update("action_key", e.target.value)} /></FormField>
            <FormField label="Channel" required><Select required value={editing.action_channel} onChange={(e: any) => update("action_channel", e.target.value)}><option value="">Select channel</option>{options.channels.map((value: string) => <option key={value} value={value}>{value}</option>)}</Select></FormField>
            <FormField label="Template Key" required><Input value={editing.action_template_key} onChange={(e: any) => update("action_template_key", e.target.value)} /></FormField>
            <FormField label="Cooldown Days"><Input type="number" min="1" value={editing.action_cooldown_days} onChange={(e: any) => update("action_cooldown_days", e.target.value)} /></FormField>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={editing.action_requires_approval} onChange={(e) => update("action_requires_approval", e.target.checked)} />Staff approval required</label>
          </>}

          <div className="flex gap-2 md:col-span-2 xl:col-span-4">
            <Button disabled={busy}>{busy ? "Saving..." : editingId ? "Update Rule" : "Create Rule"}</Button>
            {editingId && <ActionButton onClick={() => { setEditing(EMPTY_RULE); setEditingId(""); }}>Cancel</ActionButton>}
          </div>
        </form>
      </Card>

      <Card>
        <h4 className="font-bold">Configured Rules</h4>
        <div className="mt-3 space-y-2">
          {!busy && rules.length === 0 && <p className="text-sm text-slate-500">No rules configured. Patient flags remain empty until the tenant creates a rule.</p>}
          {rules.map((rule: any) => (
            <div key={rule.id} className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2"><b>{rule.name}</b><Badge tone={rule.is_enabled ? "green" : "slate"}>{rule.is_enabled ? "Enabled" : "Disabled"}</Badge>{rule.display_as_patient_badge && <span style={{ backgroundColor: rule.badge_background_color, color: rule.badge_text_color, borderColor: rule.badge_border_color }} className="rounded-full border px-2 py-0.5 text-xs font-bold">{rule.badge_label}</span>}</div>
                <p className="mt-1 text-xs text-slate-500">{rule.metric_key} {rule.operator} {rule.threshold}{rule.threshold_secondary != null ? ` / ${rule.threshold_secondary}` : ""}{rule.window_days ? ` · ${rule.window_days} day window` : ""} → {rule.flag_key}</p>
              </div>
              <ActionButton onClick={() => { setEditing(editableRule(rule)); setEditingId(rule.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</ActionButton>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
