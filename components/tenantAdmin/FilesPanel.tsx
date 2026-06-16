import { useState, useEffect, useMemo } from "react";
import {
  fileCategoryRules,
  doctypeFetchPaths,
  fileCategoryOptions,
} from "@/utils/tenantAdmin/constants";
import { apiFetch, apiUpload } from "@/lib/api";
import {
  Card,
  Badge,
  ActionButton,
  Input,
  SearchableSelect,
  Button,
} from "../common/ui";
import { FormField } from "../FormElements";
import { asOptionList, patientLabel } from "@/utils/tenantAdmin/helpers";
import { humanizeOptionLabel } from "@/lib/options";
import { UPLOADS_BASE } from "@/lib/api";
import { displayDateTime } from "@/utils/helper";

export function FilesPanel({
  apiSession,
  files,
  setFiles,
  setMessage,
  branches,
  patients,
  busy,
  setBusy,
}: any) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("general");
  const [branchId, setBranchId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [sourceModule, setSourceModule] = useState("");
  const [doctype, setDoctype] = useState("");
  const [recordId, setRecordId] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [labelValue, setLabelValue] = useState("");
  const [folder, setFolder] = useState("");
  const [notes, setNotes] = useState("");
  const [recordOptions, setRecordOptions] = useState<any[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const rule = fileCategoryRules[category] || fileCategoryRules.general;

  useEffect(() => {
    setSourceModule(rule.modules[0] || "");
    setDoctype(rule.doctypes[0] || "");
    setFieldName(rule.fields[0] || "");
    setLabelValue(rule.labels[0] || "");
    setFolder(rule.folders[0] || "");
    setRecordId("");
  }, [category]);

  const patientOptions = useMemo(
    () =>
      patients.slice(0, 500).map((patient: any) => {
        const name = patient.full_name || patient.name || "Patient";
        return {
          value: patient.id,
          label:
            name +
            (patient.patient_number ? ` — ${patient.patient_number}` : ""),
          sublabel: patient.patient_number || patient.mobile || "",
        };
      }),
    [patients],
  );

  useEffect(() => {
    if (!apiSession || !doctype) {
      setRecordOptions([]);
      return;
    }
    if (doctype === "Patient") {
      setRecordOptions(patientOptions);
      return;
    }
    if (doctype === "Tenant") {
      setRecordOptions(
        apiSession.tenantId
          ? [
              {
                value: apiSession.tenantId,
                label: "This tenant",
                sublabel: apiSession.tenantId,
              },
            ]
          : [],
      );
      return;
    }
    const fetcher = doctypeFetchPaths[doctype];
    if (!fetcher) {
      setRecordOptions([]);
      return;
    }
    let cancelled = false;
    setRecordsLoading(true);
    apiFetch(fetcher.path, apiSession)
      .then((rows: any) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setRecordOptions(
          list
            .slice(0, 500)
            .map((row: any) => ({
              value: row.id,
              label: fetcher.label(row),
              sublabel: fetcher.sublabel ? fetcher.sublabel(row) : row.id,
            })),
        );
      })
      .catch(() => {
        if (!cancelled) setRecordOptions([]);
      })
      .finally(() => {
        if (!cancelled) setRecordsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiSession?.token, apiSession?.tenantId, doctype, patientOptions]);

  const visible = files.filter((file: any) =>
    [
      file.file_name,
      file.category,
      file.source_module,
      file.attached_to_doctype,
      file.attached_to_name,
      file.attached_to_field,
      file.attached_to_label,
      file.folder,
      file.file_url,
    ].some((value) =>
      String(value || "")
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
  );

  function resetUploadForm(form?: HTMLFormElement) {
    setCategory("general");
    setBranchId("");
    setPatientId("");
    setNotes("");
    if (form) form.reset();
  }

  async function handleSubmit(event: any) {
    event.preventDefault();
    if (!apiSession) return;
    const form = event.currentTarget as HTMLFormElement;
    const fileInput = form.elements.namedItem(
      "file",
    ) as HTMLInputElement | null;
    const file = fileInput?.files?.[0] || null;
    if (!file) {
      setMessage("Choose a file to upload.");
      return;
    }
    const upload = new FormData();
    upload.append("file", file);
    const fields: Record<string, string> = {
      category,
      source_module: sourceModule,
      attached_to_doctype: doctype,
      attached_to_name: recordId,
      attached_to_field: fieldName,
      attached_to_label: labelValue,
      folder,
      notes,
      branch_id: branchId,
      patient_id: patientId,
    };
    Object.entries(fields).forEach(([key, value]) => {
      const trimmed = String(value || "").trim();
      if (trimmed) upload.append(key, trimmed);
    });
    setBusy(true);
    setMessage("");
    try {
      const created = await apiUpload("/files", apiSession, upload);
      setFiles((previous: any[]) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);
      resetUploadForm(form);
      setMessage(`File uploaded: ${created.file_name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not upload file.");
    } finally {
      setBusy(false);
    }
  }

  async function syncUploadsFolder() {
    if (!apiSession) return;
    setSyncing(true);
    setMessage("");
    try {
      const created = await apiFetch("/files/sync-uploads", apiSession, {
        method: "POST",
      });
      const list = Array.isArray(created) ? created : [];
      if (list.length) {
        setFiles((previous: any[]) => {
          const map = new Map(
            previous.map((row: any) => [row.id, row] as [string, any]),
          );
          list.forEach((row: any) => map.set(row.id, row));
          return Array.from(map.values()).sort((a: any, b: any) =>
            String(b.created_at || "").localeCompare(
              String(a.created_at || ""),
            ),
          );
        });
      }
      setMessage(
        list.length
          ? `Registered ${list.length} file(s) from uploads folder.`
          : "Uploads folder is already in sync.",
      );
    } catch (err: any) {
      setMessage(err.message || "Could not sync uploads folder.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div>
            <h3 className="card-title font-bold">Files</h3>
            <p className="table-data text-slate-500">
              Central file registry for logos, patient photos, consent forms,
              discharge documents, reports, and module attachments. Pick a
              category and the dependent fields auto-fill with the matching
              modules and doctypes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue" className="rounded-lg px-2 py-2 ">{files.length} files</Badge>
            <ActionButton
              type="button"
              onClick={syncUploadsFolder}
              disabled={syncing || !apiSession}
            >
              {syncing ? "Syncing..." : "Sync Uploads Folder"}
            </ActionButton>
          </div>
        </div>
        <form
          onSubmit={handleSubmit}
          className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
        >
          <FormField label="Upload File">
            <Input name="file" type="file" required />
          </FormField>
          <FormField label="Category">
            <SearchableSelect
              name="category"
              value={category}
              onChange={setCategory}
              options={fileCategoryOptions}
              searchPlaceholder="Search categories..."
            />
          </FormField>
          <FormField label="Branch">
            <SearchableSelect
              name="branch_id"
              value={branchId}
              onChange={setBranchId}
              placeholder="Tenant level"
              options={branches.map((branch: any) => ({
                value: branch.id,
                label: branch.name,
                sublabel: branch.code || branch.id,
              }))}
              searchPlaceholder="Search branches..."
            />
          </FormField>
          <FormField label="Patient">
            <SearchableSelect
              name="patient_id"
              value={patientId}
              onChange={setPatientId}
              placeholder="No patient link"
              options={patientOptions}
              searchPlaceholder="Search patients..."
            />
          </FormField>
          <FormField label="Source Module">
            <SearchableSelect
              name="source_module"
              value={sourceModule}
              onChange={setSourceModule}
              options={asOptionList(rule.modules)}
              searchPlaceholder="Search modules..."
              allowCustom
            />
          </FormField>
          <FormField label="Linked Doctype">
            <SearchableSelect
              name="attached_to_doctype"
              value={doctype}
              onChange={setDoctype}
              options={asOptionList(rule.doctypes)}
              searchPlaceholder="Search doctypes..."
              allowCustom
            />
          </FormField>
          <FormField label="Linked Record ID">
            <SearchableSelect
              name="attached_to_name"
              value={recordId}
              onChange={setRecordId}
              options={recordOptions}
              placeholder={
                recordsLoading
                  ? "Loading records..."
                  : recordOptions.length
                    ? "Select a record"
                    : "Type a record id"
              }
              searchPlaceholder="Search records..."
              allowCustom
              emptyText={recordsLoading ? "Loading..." : "No matching records."}
            />
          </FormField>
          <FormField label="Linked Field">
            <SearchableSelect
              name="attached_to_field"
              value={fieldName}
              onChange={setFieldName}
              options={asOptionList(rule.fields)}
              searchPlaceholder="Search fields..."
              allowCustom
            />
          </FormField>
          <FormField label="Label">
            <SearchableSelect
              name="attached_to_label"
              value={labelValue}
              onChange={setLabelValue}
              options={rule.labels.map((label) => ({ value: label, label }))}
              searchPlaceholder="Search labels..."
              allowCustom
            />
          </FormField>
          <FormField label="Folder">
            <SearchableSelect
              name="folder"
              value={folder}
              onChange={setFolder}
              options={rule.folders.map((name) => ({
                value: name,
                label: name,
              }))}
              searchPlaceholder="Search folders..."
              allowCustom
            />
          </FormField>
          <div className="md:col-span-2">
            <FormField label="Notes">
              <Input
                name="notes"
                value={notes}
                onChange={(e: any) => setNotes(e.target.value)}
                placeholder="Optional notes"
              />
            </FormField>
          </div>
          <div className="flex items-end">
            <Button disabled={busy}>
              {busy ? "Uploading..." : "Upload File"}
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <h4 className="text-base lg:text-lg font-bold">File Registry</h4>
            <p className="text-xs lg:text-sm text-slate-500">
              Files created from module uploads appear here automatically. Use
              Sync Uploads Folder to register pre-existing files from the server
              uploads directory.
            </p>
          </div>
          <FormField label="Search">
            <Input
              value={query}
              onChange={(e: any) => setQuery(e.target.value)}
              placeholder="Search files"
            />
          </FormField>
        </div>
        <div className="mt-4 overflow-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 w-[100px]">File</th>
                <th>Category</th>
                <th>Attached To</th>
                <th>Patient</th>
                <th>Created</th>
                <th className="pr-4">Open</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-slate-500">
                    No files found.
                  </td>
                </tr>
              )}
              {visible.map((file: any) => (
                <tr key={file.id} className="align-top">
                  <td className="px-4 py-4">
                    <b>{file.file_name}</b>
                    <p className="break-all text-xs text-slate-500">
                      {file.file_url}
                    </p>
                  </td>
                  <td>
                    <Badge tone="blue" className="rounded-full px-2 py-2 text-xs lg:text-sm w-[50%]">
                      {humanizeOptionLabel(file.category)}
                    </Badge>
                    <p className="mt-1 text-xs lg:text-sm text-slate-500">
                      {file.source_module || "-"}
                    </p>
                  </td>
                  <td>
                    <b className="text-xs lg:text-sm">{file.attached_to_doctype || "-"}</b>
                    <p className="break-all text-xs text-slate-500">
                      {[file.attached_to_name, file.attached_to_field]
                        .filter(Boolean)
                        .join(" / ") || "-"}
                    </p>
                  </td>
                  <td className="text-xs lg:text-sm">{patientLabel(patients, file.patient_id)}</td>
                  <td className="text-xs lg:text-sm">
                    {file.created_at
                      ? displayDateTime(file.created_at)
                      : "-"}
                  </td>
                  <td className="pr-4">
                    <a
                      href={
                        file.file_url?.startsWith("/uploads/")
                          ? `${UPLOADS_BASE}${file.file_url}`
                          : file.file_url
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-blue-700 underline"
                    >
                      Open
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
