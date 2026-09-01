import { initialDraft, SAMPLE_VALUES_BY_FIELD, serviceScopes } from "./constants";
import { humanizeOptionLabel, normalizeOptionLabel } from "@/lib/options";
import { uploadAssetUrl } from "@/lib/api";
import { displayDate } from "@/utils/helper";
import { WhatsAppCustomTemplate, WhatsAppFieldOption, WhatsAppFlowKey, WhatsAppLanguage, WhatsAppSettingsDraft, WhatsAppTestDraft } from "./types";

export function title(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDate(value: any) {
  return displayDate(value);
}

export function isLocked(row: any) {
  return Boolean(
    row?.is_template_locked ||
    row?.source_template_role_id ||
    row?.source_template_department_id ||
    row?.source_template_branch_id,
  );
}

export function scopeLabel(value: any) {
  return (
    serviceScopes.find(([scope]) => scope === value)?.[1] ||
    title(String(value || "all").replaceAll("_", " "))
  );
}

export function roleKeyLabel(value: any) {
  return humanizeOptionLabel(
    String(value || "")
      .replace(/^sun_[a-z0-9]+_/i, "")
      .replace(/^tenant_/i, "tenant "),
  );
}

export function settingLabel(value: any) {
  return humanizeOptionLabel(
    String(value || "")
      .split(".")
      .pop() || value,
  );
}

export function settingValueLabel(value: any) {
  if (Array.isArray(value))
    return (
      value.map((item: any) => humanizeOptionLabel(item)).join(", ") || "-"
    );
  if (value && typeof value === "object")
    return Object.entries(value)
      .map(
        ([key, item]) =>
          `${humanizeOptionLabel(key)}: ${settingValueLabel(item)}`,
      )
      .join(", ");
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try {
        return settingValueLabel(JSON.parse(trimmed));
      } catch {}
    }
    return humanizeOptionLabel(trimmed);
  }
  if (value === true) return "Yes";
  if (value === false) return "No";
  return value ?? "-";
}


export function dateToInput(value: any) {
  return value ? String(value).slice(0, 10) : "";
}

export function dateInputToIso(value: any) {
  const raw = String(value || "");
  return raw ? `${raw}T00:00:00Z` : null;
}


export function patientLabel(patients: any[], patientId: any) {
  const patient = patients.find((row: any) => row.id === patientId);
  return patient
    ? [patient.full_name || patient.name, patient.patient_number]
        .filter(Boolean)
        .join(" - ")
    : patientId || "-";
}

export function assetUrl(value: string) {
  return uploadAssetUrl(value);
}

export function listValue(value: string) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function asOptionList(values: string[]) {
  return values.map((value) => ({ value, label: humanizeOptionLabel(value) }));
}


export function groupDepartmentsByName(departments: any[], branches: any[]) {
  const branchName = (id: string) =>
    branches.find((branch: any) => branch.id === id)?.name || "All branches";
  const groups = new Map<string, any[]>();
  for (const department of departments || []) {
    const key = normalizeOptionLabel(
      department.name || department.code || department.id,
    );
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), department]);
  }
  return Array.from(groups.values()).map((rows: any[]) => {
    const sorted = [...rows].sort((a: any, b: any) =>
      String(a.branch_id || "").localeCompare(String(b.branch_id || "")),
    );
    const primary =
      sorted.find((row: any) => row.is_active) !== undefined
        ? sorted.find((row: any) => row.is_active)
        : sorted[0];
    const branchNames = Array.from(
      new Set(
        sorted.map((row: any) => branchName(row.branch_id)).filter(Boolean),
      ),
    );
    return {
      ...primary,
      id: sorted.map((row: any) => row.id).join("|"),
      primary,
      rows: sorted,
      branch_names: branchNames.join(", "),
      is_active: sorted.some((row: any) => row.is_active),
      locked: sorted.some((row: any) => isLocked(row)),
    };
  });
}

export function tenantRoleOptions(
  roles: any[],
  _branches: any[],
  _selectedBranchId: string,
  selectedKeys: string[],
) {
  const selectedSet = new Set(selectedKeys || []);
  const withTenantAdmin = (roles || []).some(
    (role: any) => role.key === "tenant_admin",
  )
    ? roles || []
    : [
        {
          id: "tenant_admin_default",
          key: "tenant_admin",
          name: "Tenant Admin",
          permission_keys: [],
        },
        ...(roles || []),
      ];
  const byName = new Map<string, any>();
  for (const role of withTenantAdmin) {
    const roleKey = String(role?.key || "").trim();
    if (!roleKey) continue;
    const roleName = String(role.name || roleKeyLabel(roleKey)).trim();
    const key = normalizeOptionLabel(roleName);
    if (!key) continue;
    const next = { ...role, name: roleName, branchLabel: "" };
    const existing = byName.get(key);
    if (!existing || selectedSet.has(roleKey)) {
      byName.set(key, next);
    }
  }
  return Array.from(byName.values()).sort((a: any, b: any) =>
    String(a.name).localeCompare(String(b.name)),
  );
}

export function permissionModuleTitle(module: string) {
  const labels: Record<string, string> = {
    dashboard: "Dashboard / Overview",
    departments: "Medical Departments",
    "identity.users": "Users",
    "identity.roles": "Roles",
    "platform.tenants": "Tenant Management",
    "platform.subscriptions": "Subscription Management",
    "subscriptions.reports": "Subscription Reports",
    practitioners: "Doctors & Practitioners",
    scheduling: "Doctor Scheduling",
    consultations: "Doctor Workspace & Consultations",
    patients: "EMR / Patient Management",
    queue: "Token Queue",
    service_items: "Items / Service Catalog",
    billing: "Billing",
    "billing.discounts": "Billing Discounts",
    "billing.refunds": "Billing Refunds",
    invoices: "Invoices & Receipts",
    payments: "Payments",
    settlements: "Doctor Settlements",
    lab: "Lab & Services",
    "lab.results": "Lab Results",
    pharmacy: "Pharmacy / Prescriptions",
    patient_subscriptions: "Patient Membership",
    home_care: "Home Care",
    ip: "IP Admission",
    audit: "Audit & Compliance",
    reports: "Reports",
    "reports.revenue": "Revenue Reports",
    error_logs: "Error Logs",
    communications: "Communications",
    "communications.whatsapp": "WhatsApp Communications",
    "communications.sms": "SMS Communications",
    "communications.voice": "Voice Communications",
    "ai.assist": "AI Assist",
  };
  if (labels[module]) return labels[module];
  return title(module.replaceAll("_", " ").replaceAll(".", " "));
}

export function userRoleLabels(user: any, tenantRoles: any[] = []) {
  const roleLabelByValue = new Map<string, string>();
  for (const role of tenantRoles || []) {
    const label = String(role?.name || roleKeyLabel(role?.key)).trim();
    if (!label) continue;
    [role?.key, role?.id, role?.name]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .forEach((value) => roleLabelByValue.set(value, label));
  }

  const rawRoles = Array.isArray(user?.roles)
    ? user.roles
    : String(user?.roles || "").split(",");
  const roles = rawRoles
    .map((role: any) => String(role || "").trim())
    .filter(Boolean);
  const fallback = String(user?.user_type || "").trim();
  const unique = Array.from(
    new Set<string>(roles.length ? roles : fallback ? [fallback] : []),
  );
  return unique.map(
    (role) => roleLabelByValue.get(role) || roleKeyLabel(role) || "Staff",
  );
}


export function buildTestDraft(
  flowKey: WhatsAppFlowKey,
  fieldKeys: string[],
  customTemplateId: string | null,
  language: WhatsAppLanguage,
  appointmentViewUrl: string,
): WhatsAppTestDraft {
  const parameters = fieldKeys.map((fieldKey) =>
    fieldKey === "appointment_view_url" && appointmentViewUrl.trim()
      ? appointmentViewUrl.trim()
      : SAMPLE_VALUES_BY_FIELD[fieldKey] || "",
  );
  const recipientIndex = fieldKeys.indexOf("recipient_name");
  return {
    mobile: "",
    recipientName:
      (recipientIndex >= 0 ? parameters[recipientIndex] : parameters[0]) ||
      "Test Patient",
    flowKey,
    customTemplateId,
    language,
    parameters,
    mediaUrl: "",
    mediaFilename:
      flowKey === "lab_report_ready_patient" ? "lab-report.pdf" : "invoice.pdf",
  };
}


export function createTestDraft(
  flowKey: WhatsAppFlowKey,
  fieldCatalog: Partial<Record<WhatsAppFlowKey, WhatsAppFieldOption[]>>,
  templateFieldMappings: Partial<Record<WhatsAppFlowKey, string[]>>,
  language: WhatsAppLanguage = "en",
  appointmentViewUrl: string = "",
): WhatsAppTestDraft {
  const fieldKeys =
    templateFieldMappings[flowKey] ||
    (fieldCatalog[flowKey] || []).map((field) => field.key);
  return buildTestDraft(flowKey, fieldKeys, null, language, appointmentViewUrl);
}



export function createCustomTemplateTestDraft(
  template: WhatsAppCustomTemplate,
  language: WhatsAppLanguage = "en",
): WhatsAppTestDraft {
  return buildTestDraft(
    template.trigger_key,
    template.parameters,
    template.id,
    language,
    "",
  );
}


export function readDraft(value: any): WhatsAppSettingsDraft {
  return {
    enabled: Boolean(value?.enabled),
    apiUrl: String(value?.api_url || ""),
    publicMediaBaseUrl: String(value?.public_media_base_url || ""),
    appointmentViewUrl: String(value?.appointment_view_url || ""),
    apiKey: "",
    defaultCountryCode: String(value?.default_country_code || "+91"),
    timeoutSeconds: Number(value?.timeout_seconds || 15),
    maxAttempts: Number(value?.max_attempts || 5),
    patientNotificationsEnabled: Boolean(
      value?.patient_notifications_enabled ?? true,
    ),
    doctorNotificationsEnabled: Boolean(
      value?.doctor_notifications_enabled ?? true,
    ),
    adminRecipientUserIds: Array.isArray(value?.admin_recipient_user_ids)
      ? value.admin_recipient_user_ids.map(String)
      : [],
    adminRecipientOptions: Array.isArray(value?.admin_recipient_options)
      ? value.admin_recipient_options.map((option: any) => ({
          userId: String(option.user_id || ""),
          name: String(option.name || ""),
          mobile: String(option.mobile || ""),
          userType: String(option.user_type || "staff"),
        }))
      : [],
    appointmentReminder24hEnabled: Boolean(
      value?.appointment_reminder_24h_enabled ?? false,
    ),
    appointmentReminder2hEnabled: Boolean(
      value?.appointment_reminder_2h_enabled ?? false,
    ),
    defaultLanguage: (value?.default_language || "en") as WhatsAppLanguage,
    templates: {
      ...initialDraft.templates,
      ...(value?.templates || {}),
    },
    localizedTemplates: Object.fromEntries(
      Object.entries(value?.localized_templates || {}).map(([language, templates]) => [
        language,
        { ...initialDraft.templates, ...(templates as object) },
      ]),
    ),
    flows: {
      ...initialDraft.flows,
      ...(value?.flows || {}),
    },
    customTemplates: Array.isArray(value?.custom_templates)
      ? value.custom_templates
      : [],
    fieldCatalog: Array.isArray(value?.field_catalog)
      ? Object.fromEntries(
          value.field_catalog.map((entry: any) => [
            entry.trigger_key,
            Array.isArray(entry.fields) ? entry.fields : [],
          ]),
        )
      : {},
    templateFieldMappings:
      value?.template_field_mappings && typeof value.template_field_mappings === "object"
        ? value.template_field_mappings
        : {},
  };
}


export function confirmTemplateDelete(templateName: string) {
  const message = `Delete "${templateName}"?\n\nThis will remove this template configuration immediately. Existing sent messages will not be affected.`;
  try {
    return window.confirm(message) !== false;
  } catch {
    return true;
  }
}

export function setTemplateInDraft(
  draft: WhatsAppSettingsDraft,
  activeTemplateLanguage: WhatsAppLanguage,
  flowKey: WhatsAppFlowKey,
  value: string,
): WhatsAppSettingsDraft {
  if (activeTemplateLanguage === draft.defaultLanguage) {
    return { ...draft, templates: { ...draft.templates, [flowKey]: value } };
  }
  return {
    ...draft,
    localizedTemplates: {
      ...draft.localizedTemplates,
      [activeTemplateLanguage]: {
        ...initialDraft.templates,
        ...(draft.localizedTemplates[activeTemplateLanguage] || {}),
        [flowKey]: value,
      },
    },
  };
}

export function addTemplateFieldInDraft(
  draft: WhatsAppSettingsDraft,
  flowKey: WhatsAppFlowKey,
  fieldKey: string,
  max: number,
): WhatsAppSettingsDraft {
  const existing =
    draft.templateFieldMappings[flowKey] ||
    (draft.fieldCatalog[flowKey] || []).map((field) => field.key);
  if (existing.length >= max) return draft;
  return {
    ...draft,
    templateFieldMappings: {
      ...draft.templateFieldMappings,
      [flowKey]: [...existing, fieldKey],
    },
  };
}

export function removeTemplateFieldInDraft(
  draft: WhatsAppSettingsDraft,
  flowKey: WhatsAppFlowKey,
  index: number,
): WhatsAppSettingsDraft {
  const existing = draft.templateFieldMappings[flowKey] || [];
  if (index < 0 || index >= existing.length) return draft;
  return {
    ...draft,
    templateFieldMappings: {
      ...draft.templateFieldMappings,
      [flowKey]: existing.filter((_field, fieldIndex) => fieldIndex !== index),
    },
  };
}

export function moveTemplateFieldInDraft(
  draft: WhatsAppSettingsDraft,
  flowKey: WhatsAppFlowKey,
  index: number,
  direction: -1 | 1,
): WhatsAppSettingsDraft {
  const existing = draft.templateFieldMappings[flowKey] || [];
  const target = index + direction;
  if (target < 0 || target >= existing.length) return draft;
  const parameters = [...existing];
  [parameters[index], parameters[target]] = [parameters[target], parameters[index]];
  return {
    ...draft,
    templateFieldMappings: { ...draft.templateFieldMappings, [flowKey]: parameters },
  };
}

export function setFlowInDraft(
  draft: WhatsAppSettingsDraft,
  flowKey: WhatsAppFlowKey,
  value: boolean,
): WhatsAppSettingsDraft {
  return {
    ...draft,
    flows: { ...draft.flows, [flowKey]: value },
    ...(flowKey === "appointment_reminder_patient" && !value
      ? { appointmentReminder24hEnabled: false, appointmentReminder2hEnabled: false }
      : {}),
  };
}

export function changeDefaultLanguageInDraft(
  draft: WhatsAppSettingsDraft,
  language: WhatsAppLanguage,
): WhatsAppSettingsDraft {
  if (language === draft.defaultLanguage) return draft;
  const nextDefault = {
    ...initialDraft.templates,
    ...(draft.localizedTemplates[language] || {}),
  };
  const localizedTemplates = {
    ...draft.localizedTemplates,
    [draft.defaultLanguage]: draft.templates,
  };
  delete localizedTemplates[language];
  return {
    ...draft,
    defaultLanguage: language,
    templates: nextDefault,
    localizedTemplates,
  };
}

export function addCustomTemplateFieldInDraft(
  draft: WhatsAppSettingsDraft,
  templateId: string,
  fieldKey: string,
  max: number,
): WhatsAppSettingsDraft {
  return {
    ...draft,
    customTemplates: draft.customTemplates.map((template) => {
      if (template.id !== templateId) return template;
      if (template.parameters.length >= max) return template;
      return { ...template, parameters: [...template.parameters, fieldKey] };
    }),
  };
}

export function removeCustomTemplateFieldInDraft(
  draft: WhatsAppSettingsDraft,
  templateId: string,
  index: number,
): WhatsAppSettingsDraft {
  return {
    ...draft,
    customTemplates: draft.customTemplates.map((template) =>
      template.id === templateId
        ? {
            ...template,
            parameters: template.parameters.filter(
              (_field, fieldIndex) => fieldIndex !== index,
            ),
          }
        : template,
    ),
  };
}

export function moveCustomTemplateFieldInDraft(
  draft: WhatsAppSettingsDraft,
  templateId: string,
  index: number,
  direction: -1 | 1,
): WhatsAppSettingsDraft {
  return {
    ...draft,
    customTemplates: draft.customTemplates.map((template) => {
      if (template.id !== templateId) return template;
      const target = index + direction;
      if (target < 0 || target >= template.parameters.length) return template;
      const parameters = [...template.parameters];
      [parameters[index], parameters[target]] = [parameters[target], parameters[index]];
      return { ...template, parameters };
    }),
  };
}

export function updateCustomTemplateInDraft(
  draft: WhatsAppSettingsDraft,
  templateId: string,
  updates: Partial<WhatsAppCustomTemplate>,
): WhatsAppSettingsDraft {
  return {
    ...draft,
    customTemplates: draft.customTemplates.map((template) =>
      template.id === templateId ? { ...template, ...updates } : template,
    ),
  };
}

export function removeCustomTemplateFromDraft(
  draft: WhatsAppSettingsDraft,
  templateId: string,
): WhatsAppSettingsDraft {
  return {
    ...draft,
    customTemplates: draft.customTemplates.filter((item) => item.id !== templateId),
  };
}

export function deleteBuiltInTemplateFromDraft(
  draft: WhatsAppSettingsDraft,
  flowKey: WhatsAppFlowKey,
): WhatsAppSettingsDraft {
  return {
    ...draft,
    flows: { ...draft.flows, [flowKey]: false },
    templates: { ...draft.templates, [flowKey]: "" },
    localizedTemplates: Object.fromEntries(
      Object.entries(draft.localizedTemplates).map(([language, templates]) => [
        language,
        { ...templates, [flowKey]: "" },
      ]),
    ),
    templateFieldMappings: { ...draft.templateFieldMappings, [flowKey]: [] },
    ...(flowKey === "appointment_reminder_patient"
      ? { appointmentReminder24hEnabled: false, appointmentReminder2hEnabled: false }
      : {}),
  };
}

export function addNotificationTemplateToDraft(
  draft: WhatsAppSettingsDraft,
  newTemplate: {
    name: string;
    description: string;
    triggerKey: WhatsAppFlowKey;
    parameters: string[];
    englishIdentifier: string;
    tamilIdentifier: string;
  },
  flowOptions: Array<{
    key: WhatsAppFlowKey;
    audience: "patient" | "doctor" | "user";
  }>,
): WhatsAppSettingsDraft {
  const name = newTemplate.name.trim();
  const englishIdentifier = newTemplate.englishIdentifier.trim();
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "template";
  const id = `custom_${slug}_${Date.now().toString(36)}`;
  return {
    ...draft,
    customTemplates: [
      ...draft.customTemplates,
      {
        id,
        name,
        description: newTemplate.description.trim(),
        audience:
          flowOptions.find((flow) => flow.key === newTemplate.triggerKey)?.audience ||
          "patient",
        enabled: true,
        trigger_key: newTemplate.triggerKey,
        parameters: newTemplate.parameters,
        identifiers: {
          en: englishIdentifier,
          ...(newTemplate.tamilIdentifier.trim()
            ? { ta: newTemplate.tamilIdentifier.trim() }
            : {}),
        },
      },
    ],
  };
}

export function isDeletedBuiltInTemplate(
  draft: WhatsAppSettingsDraft,
  flowKey: WhatsAppFlowKey,
) {
  const fields = draft.templateFieldMappings[flowKey];
  return (
    Array.isArray(fields) &&
    fields.length === 0 &&
    !draft.flows[flowKey] &&
    !draft.templates[flowKey]?.trim()
  );
}

export function getEligibleTestFlows<
  T extends {
    key: WhatsAppFlowKey;
    audience: "patient" | "doctor" | "user";
  },
>(draft: WhatsAppSettingsDraft, flowOptions: T[]) {
  return flowOptions.filter((flow) => {
    const audienceEnabled =
      flow.audience === "doctor"
        ? draft.doctorNotificationsEnabled
        : flow.audience === "patient"
          ? draft.patientNotificationsEnabled
          : true;
    return (
      audienceEnabled &&
      draft.flows[flow.key] &&
      draft.templates[flow.key].trim() &&
      // A custom template attached to this trigger takes over sending for
      // it, so the built-in default is no longer what actually goes out.
      !draft.customTemplates.some(
        (template) => template.enabled && template.trigger_key === flow.key,
      )
    );
  });
}

export function getEligibleCustomTemplates(draft: WhatsAppSettingsDraft) {
  return draft.customTemplates.filter(
    (template) =>
      template.enabled &&
      template.parameters.length > 0 &&
      Object.keys(template.identifiers).length > 0 &&
      (template.audience === "doctor"
        ? draft.doctorNotificationsEnabled
        : template.audience === "patient"
          ? draft.patientNotificationsEnabled
          : true),
  );
}

export function getActiveTemplates(
  draft: WhatsAppSettingsDraft,
  activeTemplateLanguage: WhatsAppLanguage,
) {
  return activeTemplateLanguage === draft.defaultLanguage
    ? draft.templates
    : {
        ...initialDraft.templates,
        ...(draft.localizedTemplates[activeTemplateLanguage] || {}),
      };
}

export function getMissingLocalizedCount(
  draft: WhatsAppSettingsDraft,
  activeTemplateLanguage: WhatsAppLanguage,
  activeTemplates: Record<WhatsAppFlowKey, string>,
  flowOptions: Array<{
    key: WhatsAppFlowKey;
    audience: "patient" | "doctor" | "user";
  }>,
) {
  if (activeTemplateLanguage === draft.defaultLanguage) return 0;
  return flowOptions.filter((flow) => {
    const audienceEnabled =
      flow.audience === "doctor"
        ? draft.doctorNotificationsEnabled
        : flow.audience === "patient"
          ? draft.patientNotificationsEnabled
          : true;
    return (
      audienceEnabled && draft.flows[flow.key] && !activeTemplates[flow.key].trim()
    );
  }).length;
}

export function getTestTemplateContext(
  draft: WhatsAppSettingsDraft,
  testDraft: WhatsAppTestDraft,
) {
  const selectedCustomTemplate = testDraft.customTemplateId
    ? draft.customTemplates.find((template) => template.id === testDraft.customTemplateId)
    : undefined;
  const testTemplateIdentifier = selectedCustomTemplate
    ? selectedCustomTemplate.identifiers[testDraft.language] ||
      selectedCustomTemplate.identifiers[draft.defaultLanguage] ||
      Object.values(selectedCustomTemplate.identifiers)[0] ||
      ""
    : testDraft.language === draft.defaultLanguage
      ? draft.templates[testDraft.flowKey]
      : draft.localizedTemplates[testDraft.language]?.[testDraft.flowKey] ||
        draft.templates[testDraft.flowKey];
  const testFieldKeys = selectedCustomTemplate
    ? selectedCustomTemplate.parameters
    : draft.templateFieldMappings[testDraft.flowKey] ||
      (draft.fieldCatalog[testDraft.flowKey] || []).map((field) => field.key);
  const testParameterLabels = testFieldKeys.map((fieldKey) => {
    const field = (
      draft.fieldCatalog[
        selectedCustomTemplate ? selectedCustomTemplate.trigger_key : testDraft.flowKey
      ] || []
    ).find((option) => option.key === fieldKey);
    return field?.label || fieldKey;
  });
  // Built-in flows conventionally put recipient name at {{1}}, but since
  // field order is now admin-editable for both built-in flows and custom
  // templates, locate it rather than assuming a fixed index.
  const recipientNameParamIndex = testFieldKeys.indexOf("recipient_name");
  return {
    selectedCustomTemplate,
    testTemplateIdentifier,
    testFieldKeys,
    testParameterLabels,
    recipientNameParamIndex,
  };
}

export function buildWhatsAppSettingsPayload(draft: WhatsAppSettingsDraft) {
  return {
    enabled: draft.enabled,
    api_url: draft.apiUrl.trim() || null,
    public_media_base_url: draft.publicMediaBaseUrl.trim() || null,
    appointment_view_url: draft.appointmentViewUrl.trim() || null,
    api_key: draft.apiKey.trim() || undefined,
    default_country_code: draft.defaultCountryCode.trim(),
    timeout_seconds: draft.timeoutSeconds,
    max_attempts: draft.maxAttempts,
    patient_notifications_enabled: draft.patientNotificationsEnabled,
    doctor_notifications_enabled: draft.doctorNotificationsEnabled,
    admin_recipient_user_ids: draft.adminRecipientUserIds,
    appointment_reminder_24h_enabled: draft.appointmentReminder24hEnabled,
    appointment_reminder_2h_enabled: draft.appointmentReminder2hEnabled,
    default_language: draft.defaultLanguage,
    templates: draft.templates,
    localized_templates: draft.localizedTemplates,
    flows: draft.flows,
    custom_templates: draft.customTemplates,
    template_field_mappings: draft.templateFieldMappings,
  };
}
