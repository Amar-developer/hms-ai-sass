import { useState, useEffect, useMemo } from "react";
import { fileCategoryOptions,doctypeFetchPaths,fileCategoryRules } from "../constants";
import { apiFetch, apiUpload, uploadAssetUrl } from "@/lib/api";
import { FormField } from "@/app/components/FormElements";
import { Card,Button,Input, SearchableSelect, Badge, ActionButton } from "@/app/components/common/ui";
import { asOptionList,patientLabel } from "../helpers";
import { humanizeOptionLabel } from "@/lib/options";
import { capitalizeFirst, displayDateTime } from "@/utils/helper";
import { isActivePatientRecord,patientPickerLabel } from "@/features/patients/helpers";
import { useForm } from "react-hook-form";
import {
  DocumentUploadFormValues,
  documentUploadSchema,
} from "../settings.schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pagination } from "@/app/components/common/Pagination";
import { pageSize } from "@/utils/constants";

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
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<DocumentUploadFormValues>({
    resolver: zodResolver(documentUploadSchema),

    defaultValues: {
      category: "general",
      branch_id: "",
      patient_id: "",
      source_module: "",
      attached_to_doctype: "",
      attached_to_name: "",
      attached_to_field: "",
      attached_to_label: "",
      folder: "",
      notes: "",
    },
  });
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState("general");
  const [doctype, setDoctype] = useState("");
  const [recordOptions, setRecordOptions] = useState<any[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const rule = fileCategoryRules[category] || fileCategoryRules.general;

  useEffect(() => {
    const nextSourceModule = rule.modules[0] || "";
    const nextDoctype = rule.doctypes[0] || "";
    const nextFieldName = rule.fields[0] || "";
    const nextLabel = rule.labels[0] || "";
    const nextFolder = rule.folders[0] || "";
    setDoctype(nextDoctype);
    setValue("source_module", nextSourceModule);
    setValue("attached_to_doctype", nextDoctype);
    setValue("attached_to_name", "");
    setValue("attached_to_field", nextFieldName);
    setValue("attached_to_label", nextLabel);
    setValue("folder", nextFolder);
  }, [category, rule, setValue]);

  const patientOptions = useMemo(
    () =>
      patients
        .filter(isActivePatientRecord)
        .slice(0, 500)
        .map((patient: any) => {
          return {
            value: patient.id,
            label: patientPickerLabel(patient),
            sublabel: patient.patient_number || patient.mobile || patient.id,
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
          list.slice(0, 500).map((row: any) => ({
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
  }, [apiSession?.tenantId, doctype, patientOptions]);

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
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedFiles = visible.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function resetUploadForm() {
    const generalRule = fileCategoryRules.general;
    setCategory("general");
    setDoctype(generalRule.doctypes[0] || "");

    reset({
      category: "general",
      branch_id: "",
      patient_id: "",
      source_module: generalRule.modules[0] || "",
      attached_to_doctype: generalRule.doctypes[0] || "",
      attached_to_name: "",
      attached_to_field: generalRule.fields[0] || "",
      attached_to_label: generalRule.labels[0] || "",
      folder: generalRule.folders[0] || "",
      notes: "",
    });
  }

  async function handlerSubmit(data: DocumentUploadFormValues) {
    if (!apiSession) return;

    const file = data.file?.[0];

    if (!file) {
      setMessage("Choose a file to upload.");
      return;
    }

    const upload = new FormData();

    upload.append("file", file);

    const fields: Record<string, string> = {
      category: data.category || "general",
      source_module: data.source_module || "",
      attached_to_doctype: data.attached_to_doctype || "",
      attached_to_name: data.attached_to_name || "",
      attached_to_field: data.attached_to_field || "",
      attached_to_label: data.attached_to_label || "",
      folder: data.folder || "",
      notes: data.notes || "",
      branch_id: data.branch_id || "",
      patient_id: data.patient_id || "",
    };

    Object.entries(fields).forEach(([key, value]) => {
      const trimmed = String(value || "").trim();

      if (trimmed) {
        upload.append(key, trimmed);
      }
    });

    setBusy(true);
    setMessage("");

    try {
      const created = await apiUpload("/files", apiSession, upload);

      setFiles((previous: any[]) => [
        created,
        ...previous.filter((row: any) => row.id !== created.id),
      ]);

      resetUploadForm();

      setMessage(`File uploaded: ${created.file_name}`);
    } catch (err: any) {
      setMessage(err.message || "Could not upload file.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteFile(file: any) {
    if (!apiSession) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete "${file.file_name}" from the registry?`)
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await apiFetch(`/files/${file.id}`, apiSession, { method: "DELETE" });
      setFiles((previous: any[]) =>
        previous.filter((row: any) => row.id !== file.id),
      );
      setMessage(`Deleted ${file.file_name}.`);
    } catch (err: any) {
      setMessage(err.message || "Could not delete file.");
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
            <p className="card-desc text-slate-500">
              Centralized file storage with automatic module and document type
              mapping.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue" className="normal-badge">
              {files.length} files
            </Badge>
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
          onSubmit={handleSubmit(handlerSubmit)}
          className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"
        >
          <FormField label="Upload File">
            <Input type="file" {...register("file")} />

            {errors.file && (
              <p className="text-xs text-red-500">
                {errors.file.message as string}
              </p>
            )}
          </FormField>
          <FormField label="Category">
            <SearchableSelect
              name="category"
              value={watch("category")}
              onChange={(value) => {
                setValue("category", value);
                setCategory(value);
              }}
              options={fileCategoryOptions}
              searchPlaceholder="Search categories..."
              // className="select-input"
            />
          </FormField>
          <FormField label="Branch">
            <SearchableSelect
              value={watch('branch_id')}
              onChange={(value) => {
                setValue("branch_id", value);
              }}
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
              value={watch('patient_id')}
              onChange={(value) => {
                setValue("patient_id", value);
              }}
              placeholder="No patient link"
              options={patientOptions}
              searchPlaceholder="Search patients..."
            />
          </FormField>
          <FormField label="Source Module">
            <SearchableSelect
              value={watch('source_module')}
              onChange={(value) => {
                setValue("source_module", value);
              }}
              options={asOptionList(rule.modules)}
              searchPlaceholder="Search modules..."
              allowCustom
            />
          </FormField>
          <FormField label="Linked Doctype">
            <SearchableSelect
              value={watch('attached_to_doctype')}
              onChange={(value) => {
                setValue("attached_to_doctype", value);
                setDoctype(value);
                setValue("attached_to_name", "");
              }}
              options={asOptionList(rule.doctypes)}
              searchPlaceholder="Search doctypes..."
              allowCustom
            />
          </FormField>
          <FormField label="Linked Record ID">
            <SearchableSelect
              value={watch('attached_to_name')}
              onChange={(value) => {
                setValue("attached_to_name", value);
              }}
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
              value={watch('attached_to_field')}
              onChange={(value) => {
                setValue("attached_to_field", value);
              }}
              options={asOptionList(rule.fields)}
              searchPlaceholder="Search fields..."
              allowCustom
            />
          </FormField>
          <FormField label="Label">
            <SearchableSelect
              value={watch('attached_to_label')}
              onChange={(value) => {
                setValue("attached_to_label", value);
              }}
              options={rule.labels.map((label) => ({ value: label, label }))}
              searchPlaceholder="Search labels..."
              allowCustom
            />
          </FormField>
          <FormField label="Folder">
            <SearchableSelect
              value={watch('folder')}
              onChange={(value) => {
                setValue("folder", value);
              }}
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
              <Input {...register("notes")} placeholder="Optional notes" />

              {errors.notes && (
                <p className="text-xs text-red-500">{errors.notes.message}</p>
              )}
            </FormField>
          </div>
          <div className="flex items-end">
            <Button disabled={busy} className="save-button">
              {busy ? "Uploading..." : "Upload File"}
            </Button>
          </div>
        </form>
      </Card>
      <Card>
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <h4 className="card-title font-bold">File Registry</h4>
            <p className="card-desc text-slate-500">
              Uploaded files appear automatically. Sync existing server files
              when needed.
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
                <th className="pr-4">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-slate-500">
                    No files found.
                  </td>
                </tr>
              )}
              {pagedFiles.map((file: any) => (
                <tr key={file.id} className="align-top">
                  <td className="px-2 py-2">
                    <div className="max-w-[200px]">
                      <p
                        className="font-bold truncate text-xs"
                        title={file?.file_name}
                      >
                        {capitalizeFirst(file.file_name)}
                      </p>
                    </div>
                    {/* <div className="max-w-[200px]">
                      <p
                        className="truncate text-xs text-slate-500"
                        title={file.file_url}
                      >
                        {file.file_url}
                      </p>
                    </div> */}
                  </td>
                  <td>
                    <Badge
                      tone="blue"
                      className="rounded-full px-2 py-2 text-xs w-[50%]"
                    >
                      {humanizeOptionLabel(file.category)}
                    </Badge>
                  </td>
                  <td className="flex justify-start items-start">
                    <div className="text-xs  mt-2">
                      {file.attached_to_doctype || "-"}
                    </div>
                  </td>
                  <td className="text-xs">
                    <div className="text-xs mt-2">
                      {patientLabel(patients, file.patient_id)}
                    </div>
                  </td>
                  <td className="text-xs">
                    <div className="text-xs mt-2">
                      {file.created_at ? displayDateTime(file.created_at) : "-"}
                    </div>
                  </td>
                  <td className="pr-4 flex items-center">
                    <a
                      href={uploadAssetUrl(file.file_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-xs text-blue-700 underline"
                    >
                      Open
                    </a>
                  </td>
                  <td className="pr-4 ">
                    <button
                      type="button"
                      onClick={() => deleteFile(file)}
                      disabled={busy}
                      className="font-semibold text-xs  mt-2 text-red-600 underline disabled:text-slate-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={safePage}
          totalPages={totalPages}
          total={visible.length}
          onPage={setPage}
        />
      </Card>
    </div>
  );
}
