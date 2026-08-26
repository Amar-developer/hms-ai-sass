import { useState, useEffect } from "react";
import { FileText } from "lucide-react";
import {
  fileCategoryOptions,
  doctypeFetchPaths,
  fileCategoryRules,
} from "../constants";
import { apiFetch, apiUpload } from "@/lib/api";
import { FormField } from "@/app/components/FormElements";
import {
  Card,
  Button,
  Input,
  SearchableSelect,
  Badge,
  ActionButton,
} from "@/app/components/common/ui";
import { asOptionList, patientLabel } from "../helpers";
import { PatientSearchSelect } from "@/features/patients/components/PatientSearchSelect";
import { useForm } from "react-hook-form";
import {
  DocumentUploadFormValues,
  documentUploadSchema,
} from "../settings.schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pagination } from "@/app/components/common/Pagination";
import { pageSize } from "@/utils/constants";
import { ConfirmModal } from "@/app/components/common/ConfirmModal";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { usePatientReferencesQuery } from "@/features/patients/api/usePatientReferencesQuery";
import { FilterSection } from "@/app/components/common/FilterSection";
import { DataTable } from "@/app/components/common/DataTable";
import { getFileColumns } from "../column";

export function FilesPanel({
  apiSession,
  files,
  setFiles,
  setMessage,
  branches,
  busy,
  setBusy,
}: any) {
  const { patients } = usePatientReferencesQuery(
    apiSession,
    files.map((file: any) => file.patient_id),
  );
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
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const rule = fileCategoryRules[category] || fileCategoryRules.general;
  const [filterValues, setFilterValues] = useState<Record<string, string>>({
    category: "all",
  });
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const categoryOptions = [
    { value: "all", label: "All Categories" },
    ...fileCategoryOptions,
  ];

  const filters = [
    {
      key: "category",
      label: "Category",
      options: categoryOptions,
    },
  ];

  function onFilterChange(key: string, value: string) {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }

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

  useEffect(() => {
    if (!apiSession || !doctype) {
      setRecordOptions([]);
      return;
    }
    if (doctype === "Patient") {
      setRecordOptions([]);
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
  }, [apiSession?.tenantId, doctype]);

  const visible = files.filter((file: any) => {
    const q = query.trim().toLowerCase();

    // Search (file name + patient + other fields)
    if (q) {
      const fileName = String(file.file_name || "").toLowerCase();
      const patient = patientLabel(patients, file.patient_id).toLowerCase();
      const other = [
        file.category,
        file.source_module,
        file.attached_to_doctype,
        file.attached_to_name,
        file.attached_to_field,
        file.attached_to_label,
        file.folder,
        file.file_url,
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");

      if (!fileName.includes(q) && !patient.includes(q) && !other.includes(q)) {
        return false;
      }
    }

    // Category filter
    if (filterValues.category !== "all") {
      if (String(file.category) !== filterValues.category) return false;
    }

    // Date range (created_at)
    if (dateFrom || dateTo) {
      const created = file.created_at ? new Date(file.created_at) : null;
      if (!created) return false;

      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setHours(0, 0, 0, 0);
        if (created < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (created > to) return false;
      }
    }

    return true;
  });
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedFiles = visible.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  useEffect(() => {
    setPage(1);
  }, [query, filterValues, dateFrom, dateTo]);

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
      setConfirmDelete(null);
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

  // const fileColumns: Column<any>[] = [
  //   {
  //     key: "file_name",
  //     header: "File",
  //     width: "200px",
  //     render: (file: any) => (
  //       <div className="max-w-[200px]">
  //         <p className="font-bold truncate text-xs" title={file?.file_name}>
  //           {capitalizeFirst(file.file_name)}
  //         </p>
  //       </div>
  //     ),
  //   },
  //   {
  //     key: "category",
  //     header: "Category",
  //     width: "120px",
  //     render: (file: any) => (
  //       <Badge tone="blue" className="normal-badge">
  //         {humanizeOptionLabel(file.category)}
  //       </Badge>
  //     ),
  //   },
  //   {
  //     key: "attached_to_doctype",
  //     header: "Attached To",
  //     render: (file: any) => (
  //       <div className="text-xs">{file.attached_to_doctype || "-"}</div>
  //     ),
  //   },
  //   {
  //     key: "patient_id",
  //     header: "Patient",
  //     render: (file: any) => (
  //       <div className="text-xs">{patientLabel(patients, file.patient_id)}</div>
  //     ),
  //   },
  //   {
  //     key: "created_at",
  //     header: "Created",
  //     render: (file: any) => (
  //       <div className="text-xs">
  //         {file.created_at ? displayDateTime(file.created_at) : "-"}
  //       </div>
  //     ),
  //   },
  //   {
  //     key: "actions",
  //     header: "Actions",
  //     width:'100px',
  //     disableRowClick: true,
  //     render: (file: any) => {
  //       const actions = [
  //         {
  //           label: "Open",
  //           onClick: () =>
  //             window.open(
  //               uploadAssetUrl(file.file_url),
  //               "_blank",
  //               "noopener,noreferrer",
  //             ),
  //         },
  //         {
  //           label: "Delete",
  //           danger: true,
  //           disabled: busy,
  //           onClick: () =>
  //             setConfirmDelete({ kind: "delete", entity: "file", file }),
  //         },
  //       ];

  //       return <RowActions actions={actions} className="right-5 -bottom-7" />;
  //     },
  //   },
  // ];

  const fileColumns = getFileColumns({ patients, setConfirmDelete, busy });
  useEffect(() => {
    setPage(1);
  }, [query, filterValues, dateFrom, dateTo]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  return (
    <div className="">
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
              <ButtonLoader loading={syncing}>
                {syncing ? "Syncing..." : "Sync Uploads Folder"}
              </ButtonLoader>
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
              value={watch("branch_id")}
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
            <PatientSearchSelect
              apiSession={apiSession}
              initialPatients={patients}
              value={watch("patient_id")}
              onChange={(value) => {
                setValue("patient_id", value);
              }}
              placeholder="No patient link"
              searchPlaceholder="Search patient by name, mobile, or number"
            />
          </FormField>
          <FormField label="Source Module">
            <SearchableSelect
              value={watch("source_module")}
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
              value={watch("attached_to_doctype")}
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
            {doctype === "Patient" ? (
              <PatientSearchSelect
                apiSession={apiSession}
                initialPatients={patients}
                value={watch("attached_to_name")}
                onChange={(value) => setValue("attached_to_name", value)}
                placeholder="Select patient record"
              />
            ) : (
              <SearchableSelect
                value={watch("attached_to_name")}
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
                emptyText={
                  recordsLoading ? "Loading..." : "No matching records."
                }
              />
            )}
          </FormField>
          <FormField label="Linked Field">
            <SearchableSelect
              value={watch("attached_to_field")}
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
              value={watch("attached_to_label")}
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
              value={watch("folder")}
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
              <ButtonLoader loading={busy}>
                {busy ? "Uploading..." : "Upload File"}
              </ButtonLoader>
            </Button>
          </div>
        </form>
      </Card>
      <Card className="mt-3">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <h4 className="card-title font-bold">File Registry</h4>
            <p className="card-desc text-slate-500">
              Uploaded files appear automatically. Sync existing server files
              when needed.
            </p>
          </div>
        </div>

        <FilterSection
          title="Files"
          query={query}
          setQuery={setQuery}
          filters={filters}
          filterValues={filterValues}
          onFilterChange={onFilterChange}
          onReset={() => {
            setDateFrom("");
            setDateTo("");
          }}
        >
          <FormField label="From">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e: any) => setDateFrom(e.target.value)}
            />
          </FormField>
          <FormField label="To">
            <Input
              type="date"
              value={dateTo}
              onChange={(e: any) => setDateTo(e.target.value)}
            />
          </FormField>
        </FilterSection>

        <div className="mt-4">
          <DataTable
            columns={fileColumns}
            data={pagedFiles}
            emptyMessage="No files found."
            emptyDescription="Files uploaded or synced for this tenant will show up here."
            emptyIcon={FileText}
            minBodyHeight={`${pagedFiles.length > 0 ?'':'220px'}`}
            paginate={false}
          />
        </div>

        <Pagination
          page={safePage}
          totalPages={totalPages}
          total={visible.length}
          onPage={setPage}
        />
      </Card>
      {confirmDelete && (
        <ConfirmModal
          busy={busy}
          action={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deleteFile(confirmDelete.file)}
        />
      )}
    </div>
  );
}
