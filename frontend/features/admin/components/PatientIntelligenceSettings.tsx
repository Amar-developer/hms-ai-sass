"use client";

import { useEffect, useState } from "react";
import {
  BrainCircuit,
  Library,
  ListChecks,
  PlusCircle,
  RefreshCw,
} from "lucide-react";

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
import {
  deleteIntelligenceContent,
  deleteIntelligenceRule,
  fetchIntelligenceSettings,
  recalculatePatientIntelligence,
  saveIntelligenceContent,
  saveIntelligenceRule,
} from "@/features/patient_intelligence/api/patientIntelligence.api";

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
  score_dimension: "",
  score_weight: "",
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

const EMPTY_CONTENT: any = {
  content_key: "",
  title: "",
  category: "health_tip",
  language: "en",
  audience_flag_key: "",
  body_text: "",
  priority: "100",
  is_enabled: true,
};

const CONTENT_CATEGORIES = [
  { key: "health_tip", label: "Health tip" },
  { key: "awareness", label: "Awareness" },
  { key: "medicine", label: "Medicine" },
  { key: "lab", label: "Lab" },
  { key: "membership", label: "Membership" },
  { key: "general", label: "General" },
];

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
    score_dimension: rule.score_dimension || null,
    score_weight: optionalNumber(rule.score_weight) || 0,
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
    score_dimension: String(rule.score_dimension ?? ""),
    score_weight: String(rule.score_weight ?? ""),
    required_flag_keys: (rule.required_flag_keys || []).join(", "),
  };
}

function contentPayload(content: any) {
  return {
    content_key: content.content_key,
    title: content.title,
    category: content.category,
    language: content.language || "en",
    audience_flag_key: content.audience_flag_key || null,
    body_text: content.body_text,
    priority: optionalNumber(content.priority) || 100,
    is_enabled: Boolean(content.is_enabled),
  };
}

function editableContent(content: any) {
  return {
    ...EMPTY_CONTENT,
    ...content,
    audience_flag_key: content.audience_flag_key || "",
    priority: String(content.priority ?? "100"),
  };
}

function humanizeKey(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return "-";
  return text
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function operatorLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    gte: "greater than or equal to",
    gt: "greater than",
    lte: "less than or equal to",
    lt: "less than",
    eq: "equal to",
    neq: "not equal to",
    between: "between",
  };
  return labels[String(value || "")] || humanizeKey(value);
}

function optionLabel(
  values: any[],
  key: string | null | undefined,
  fallback?: string,
) {
  const value = String(key || "");
  const option = values.find((item: any) => item.key === value);
  return option?.label || fallback || humanizeKey(value);
}

function ruleSummary(rule: any, options: any) {
  const metric = optionLabel(options.metrics || [], rule.metric_key);
  const operator = operatorLabel(rule.operator);
  const second =
    rule.threshold_secondary != null && rule.threshold_secondary !== ""
      ? ` and ${rule.threshold_secondary}`
      : "";
  const window = rule.window_days
    ? ` in ${rule.window_days} day window`
    : "";
  return `${metric} ${operator} ${rule.threshold}${second}${window} → ${humanizeKey(
    rule.flag_key,
  )}`;
}

export function PatientIntelligenceSettings({ apiSession }: any) {
  const [rules, setRules] = useState<any[]>([]);
  const [contentItems, setContentItems] = useState<any[]>([]);
  const [options, setOptions] = useState<any>({
    metrics: [],
    operators: [],
    categories: [],
    channels: [],
  });
  const [editing, setEditing] = useState<any>(EMPTY_RULE);
  const [editingId, setEditingId] = useState("");
  const [contentEditing, setContentEditing] = useState<any>(EMPTY_CONTENT);
  const [contentEditingId, setContentEditingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showAdvancedRules, setShowAdvancedRules] = useState(false);
  const [activeTab, setActiveTab] = useState<"content" | "rules">("content");

  async function load() {
    if (!apiSession) return;
    setBusy(true);
    try {
      const result = await fetchIntelligenceSettings(apiSession);
      setRules(result.rules);
      setContentItems(result.content);
      setOptions(result.configuration);
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

  function updateContent(key: string, value: any) {
    setContentEditing((current: any) => ({ ...current, [key]: value }));
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
      await saveIntelligenceRule(apiSession, payload, editingId || undefined);
      setEditing(EMPTY_RULE);
      setEditingId("");
      setShowAdvancedRules(false);
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
      const result: any = await recalculatePatientIntelligence(apiSession);
      setMessage(`${result.patients_processed || 0} patient records recalculated.`);
    } catch (error: any) {
      setMessage(error.message || "Could not recalculate existing patients.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRule(rule: any) {
    if (!apiSession || !rule?.id) return;
    const confirmed = window.confirm(
      `Delete "${rule.name}"?\n\nThis removes the rule configuration, resolves its active flags, and cancels unsent engagement actions from this rule.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    try {
      await deleteIntelligenceRule(apiSession, rule.id);
      if (editingId === rule.id) {
        setEditing(EMPTY_RULE);
        setEditingId("");
      }
      await load();
      setMessage("Rule deleted.");
    } catch (error: any) {
      setMessage(error.message || "Could not delete the rule.");
    } finally {
      setBusy(false);
    }
  }

  async function saveContent(event: any) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const payload: any = contentPayload(contentEditing);
      if (contentEditingId) delete payload.content_key;
      await saveIntelligenceContent(
        apiSession,
        payload,
        contentEditingId || undefined,
      );
      setContentEditing(EMPTY_CONTENT);
      setContentEditingId("");
      await load();
      setMessage(contentEditingId ? "Content updated." : "Content created.");
    } catch (error: any) {
      setMessage(error.message || "Could not save the content item.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteContent(content: any) {
    if (!apiSession || !content?.id) return;
    const confirmed = window.confirm(
      `Delete "${content.title}"?\n\nThis removes the tenant-managed WhatsApp content item. Existing sent history is not changed.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setMessage("");
    try {
      await deleteIntelligenceContent(apiSession, content.id);
      if (contentEditingId === content.id) {
        setContentEditing(EMPTY_CONTENT);
        setContentEditingId("");
      }
      await load();
      setMessage("Content deleted.");
    } catch (error: any) {
      setMessage(error.message || "Could not delete the content item.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <StatusToast message={message} onClose={() => setMessage("")} />
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-50 text-brand ring-1 ring-emerald-100">
              <BrainCircuit className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-base font-black tracking-tight text-slate-950">
                Patient Intelligence Workspace
              </h2>
              <p className="text-xs font-medium text-slate-500">
                Tracking, badges, content and WhatsApp engagement rules
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeTab === "rules" && (
              <ActionButton
                tone="primary"
                onClick={() => {
                  setEditing(EMPTY_RULE);
                  setEditingId("");
                  setShowAdvancedRules(true);
                }}
              >
                <PlusCircle className="h-4 w-4" />
                Add Rule
              </ActionButton>
            )}
            <ActionButton onClick={adaptExistingData} disabled={busy}>
              <RefreshCw className="h-4 w-4" />
              Recalculate Patients
            </ActionButton>
          </div>
        </div>
        <nav
          className="scrollbar-hidden flex gap-1 overflow-x-auto border-t border-slate-200 bg-slate-50 px-3 py-1.5"
          aria-label="Patient intelligence sections"
        >
          {[
            ["content", "Content Library", Library, contentItems.length],
            ["rules", "Rules", ListChecks, rules.length],
          ].map(([id, label, Icon, count]: any) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => setActiveTab(id)}
                className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-bold transition-colors ${
                  active
                    ? "bg-brand text-brand-fg"
                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                <span
                  className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] ${
                    active
                      ? "bg-white/20 text-brand-fg"
                      : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </nav>
      </section>

      {activeTab === "content" && (
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="font-bold">Content Library</h4>
            <p className="mt-1 text-sm text-slate-500">
              Tenant-managed health tips and awareness text for WhatsApp
              templates. No AI text is generated here; staff controls the exact
              approved message body.
            </p>
          </div>
          {contentEditingId && (
            <ActionButton
              onClick={() => {
                setContentEditing(EMPTY_CONTENT);
                setContentEditingId("");
              }}
            >
              Create New Content
            </ActionButton>
          )}
        </div>
        <form onSubmit={saveContent} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FormField label="Content Key" required>
            <Input
              required
              value={contentEditing.content_key}
              disabled={Boolean(contentEditingId)}
              onChange={(event: any) =>
                updateContent(
                  "content_key",
                  event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
                )
              }
              placeholder="monthly_diabetes_awareness"
            />
          </FormField>
          <FormField label="Title" required>
            <Input
              required
              value={contentEditing.title}
              onChange={(event: any) => updateContent("title", event.target.value)}
              placeholder="Monthly awareness message"
            />
          </FormField>
          <FormField label="Category" required>
            <Select
              required
              value={contentEditing.category}
              onChange={(event: any) => updateContent("category", event.target.value)}
            >
              {CONTENT_CATEGORIES.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Language" required>
            <Input
              required
              value={contentEditing.language}
              onChange={(event: any) =>
                updateContent("language", event.target.value.toLowerCase())
              }
              placeholder="en"
            />
          </FormField>
          <FormField label="Target Flag">
            <Select
              value={contentEditing.audience_flag_key}
              onChange={(event: any) =>
                updateContent("audience_flag_key", event.target.value)
              }
            >
              <option value="">Any matching health/awareness rule</option>
              {Array.from(new Set(rules.map((rule: any) => rule.flag_key)))
                .filter(Boolean)
                .sort()
                .map((flagKey: any) => (
                  <option key={flagKey} value={flagKey}>
                    {humanizeKey(flagKey)}
                  </option>
                ))}
            </Select>
          </FormField>
          <FormField label="Priority">
            <Input
              type="number"
              min="0"
              value={contentEditing.priority}
              onChange={(event: any) => updateContent("priority", event.target.value)}
            />
          </FormField>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={contentEditing.is_enabled}
              onChange={(event) => updateContent("is_enabled", event.target.checked)}
            />
            Content enabled
          </label>
          <FormField label="Message Body" required className="md:col-span-2 xl:col-span-4">
            <textarea
              required
              value={contentEditing.body_text}
              onChange={(event: any) => updateContent("body_text", event.target.value)}
              maxLength={2000}
              rows={4}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-400"
              placeholder="Enter the exact approved WhatsApp content text to insert into the template."
            />
            <p className="mt-1 text-xs font-semibold text-slate-400">
              Use this body with WhatsApp field {"{{content_body}}"}. Keep the
              wording tenant-approved and clinically safe.
            </p>
          </FormField>
          <div className="flex gap-2 md:col-span-2 xl:col-span-4">
            <Button disabled={busy}>
              {busy ? "Saving..." : contentEditingId ? "Update Content" : "Create Content"}
            </Button>
            {contentEditingId && (
              <ActionButton
                onClick={() => {
                  setContentEditing(EMPTY_CONTENT);
                  setContentEditingId("");
                }}
              >
                Cancel
              </ActionButton>
            )}
          </div>
        </form>
        <div className="mt-4 space-y-2">
          {!busy && contentItems.length === 0 && (
            <p className="text-sm text-slate-500">
              No content added yet. Health-tip rules can still run, but
              {" {{content_body}}"} will stay empty until content is configured.
            </p>
          )}
          {contentItems.map((content: any) => (
            <div
              key={content.id}
              className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <b>{content.title}</b>
                  <Badge tone={content.is_enabled ? "green" : "slate"}>
                    {content.is_enabled ? "Enabled" : "Disabled"}
                  </Badge>
                  <Badge tone="blue">{humanizeKey(content.category)}</Badge>
                  {content.audience_flag_key && (
                    <Badge tone="purple">{humanizeKey(content.audience_flag_key)}</Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                  {content.body_text}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Content key: {humanizeKey(content.content_key)} · Language:{" "}
                  {content.language} · Priority: {content.priority}
                </p>
              </div>
              <div className="flex gap-2">
                <ActionButton
                  onClick={() => {
                    setContentEditing(editableContent(content));
                    setContentEditingId(content.id);
                  }}
                >
                  Edit
                </ActionButton>
                <ActionButton tone="danger" disabled={busy} onClick={() => deleteContent(content)}>
                  Delete
                </ActionButton>
              </div>
            </div>
          ))}
        </div>
      </Card>
      )}

      {activeTab === "rules" && (
        <>
      {showAdvancedRules && <Card>
        <h4 className="font-bold">{editingId ? "Edit Rule" : "Create Rule"}</h4>
        <p className="mt-1 text-sm text-slate-500">
          To combine rules into one badge, reuse the same Generated Flag. To
          show only one tier such as Silver, Gold, or Premium, give those rules
          the same Exclusive Group. Turn off auto-resolve and set Expires After
          Days when a badge should stay for a grace period.
        </p>
        <form onSubmit={save} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FormField label="Rule Key" required>
            <Input value={editing.rule_key} disabled={Boolean(editingId)} onChange={(e: any) => update("rule_key", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} />
          </FormField>
          <FormField label="Rule Name" required><Input value={editing.name} onChange={(e: any) => update("name", e.target.value)} /></FormField>
          <FormField label="Category" required><Select required value={editing.category} onChange={(e: any) => update("category", e.target.value)}><option value="">Select category</option>{options.categories.map((value: string) => <option key={value} value={value}>{humanizeKey(value)}</option>)}</Select></FormField>
          <FormField label="Generated Flag" required><Input value={editing.flag_key} onChange={(e: any) => update("flag_key", e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))} placeholder="PREMIUM_PATIENT" /></FormField>

          <FormField label="Metric" required><Select required value={editing.metric_key} onChange={(e: any) => update("metric_key", e.target.value)}><option value="">Select metric</option>{options.metrics.map((metric: any) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}</Select></FormField>
          <FormField label="Operator" required><Select required value={editing.operator} onChange={(e: any) => update("operator", e.target.value)}><option value="">Select operator</option>{options.operators.map((value: string) => <option key={value} value={value}>{operatorLabel(value)}</option>)}</Select></FormField>
          <FormField label="Threshold" required><Input type="number" step="0.01" value={editing.threshold} onChange={(e: any) => update("threshold", e.target.value)} /></FormField>
          <FormField label="Second Threshold"><Input type="number" step="0.01" disabled={editing.operator !== "between"} value={editing.threshold_secondary} onChange={(e: any) => update("threshold_secondary", e.target.value)} /></FormField>
          <FormField label="Window Days"><Input type="number" min="1" value={editing.window_days} onChange={(e: any) => update("window_days", e.target.value)} /></FormField>
          <FormField label="Severity" required><Input required value={editing.severity} onChange={(e: any) => update("severity", e.target.value)} /></FormField>
          <FormField label="Priority" required><Input required type="number" min="0" value={editing.priority} onChange={(e: any) => update("priority", e.target.value)} /></FormField>
          <FormField label="Exclusive Group"><Input value={editing.exclusive_group} onChange={(e: any) => update("exclusive_group", e.target.value)} placeholder="patient_value_tier" /></FormField>
          <FormField label="Score Dimension"><Select value={editing.score_dimension} onChange={(e: any) => update("score_dimension", e.target.value)}><option value="">No score</option>{(options.score_dimensions || []).map((item: any) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></FormField>
          <FormField label="Score Weight"><Input type="number" min="0" step="0.01" value={editing.score_weight} onChange={(e: any) => update("score_weight", e.target.value)} placeholder="e.g. 10" /></FormField>
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
            <FormField label="Channel" required><Select required value={editing.action_channel} onChange={(e: any) => update("action_channel", e.target.value)}><option value="">Select channel</option>{options.channels.map((value: string) => <option key={value} value={value}>{humanizeKey(value)}</option>)}</Select></FormField>
            <FormField label="Template Key" required><Input value={editing.action_template_key} onChange={(e: any) => update("action_template_key", e.target.value)} /></FormField>
            <FormField label="Cooldown Days"><Input type="number" min="1" value={editing.action_cooldown_days} onChange={(e: any) => update("action_cooldown_days", e.target.value)} /></FormField>
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={editing.action_requires_approval} onChange={(e) => update("action_requires_approval", e.target.checked)} />Staff approval required</label>
          </>}

          <div className="flex gap-2 md:col-span-2 xl:col-span-4">
            <Button disabled={busy}>{busy ? "Saving..." : editingId ? "Update Rule" : "Create Rule"}</Button>
            {showAdvancedRules && <ActionButton onClick={() => { setEditing(EMPTY_RULE); setEditingId(""); setShowAdvancedRules(false); }}>Cancel</ActionButton>}
          </div>
        </form>
      </Card>}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="font-bold">Configured Rules</h4>
        </div>
        <div className="mt-3 space-y-2">
          {!busy && rules.length === 0 && (
            <p className="text-sm text-slate-500">
              No rules configured. Use the advanced editor to create database
              rules for Silver, Gold, Premium, membership, or any tenant-specific
              patient flag.
            </p>
          )}
          {rules.map((rule: any) => (
            <div key={rule.id} className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2"><b>{rule.name}</b><Badge tone={rule.is_enabled ? "green" : "slate"}>{rule.is_enabled ? "Enabled" : "Disabled"}</Badge>{rule.display_as_patient_badge && <span style={{ backgroundColor: rule.badge_background_color, color: rule.badge_text_color, borderColor: rule.badge_border_color }} className="rounded-full border px-2 py-0.5 text-xs font-bold">{rule.badge_label}</span>}</div>
                <p className="mt-1 text-xs text-slate-500">{ruleSummary(rule, options)}</p>
                <p className="mt-1 text-[11px] text-slate-400">Rule key: {humanizeKey(rule.rule_key)}{rule.action_template_key ? ` · Template: ${humanizeKey(rule.action_template_key)}` : ""}{rule.score_dimension ? ` · ${humanizeKey(rule.score_dimension)} +${rule.score_weight || 0}` : ""}</p>
              </div>
              <div className="flex gap-2">
                <ActionButton onClick={() => { setEditing(editableRule(rule)); setEditingId(rule.id); setShowAdvancedRules(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</ActionButton>
                <ActionButton tone="danger" disabled={busy} onClick={() => deleteRule(rule)}>Delete</ActionButton>
              </div>
            </div>
          ))}
        </div>
      </Card>
        </>
      )}
    </div>
  );
}
