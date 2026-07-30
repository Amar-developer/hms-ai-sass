import { uploadAssetUrl } from "@/lib/api";
import { appendLine, inr, splitRows, today } from "@/utils/helper";
import { catalogKey, isClosedAdmission } from "../helpers";
import { useEffect, useState } from "react";
import { medicineFrequencyOptions,rowTagLabel, SearchPicker, TagEntryBox } from "@/app/components/clinicalRows";
import { FormField } from "@/app/components/FormElements";
import { Card,Button,Input,Select,Badge } from "@/app/components/common/ui";
import { OverlayLoader } from "@/app/components/common/loader/OverlayLoader";
import { ButtonLoader } from "@/app/components/common/loader/ButtonLoader";
import { useIPCareActions } from "../api";

import { CollapsibleIPSection } from "./CollapsibleIPSection";

export function IPCareWorkspace({
  admission,
  treatments,
  charges,
  billingItems,
  ipDocuments,
  medicationOrders,
  medicationAdministrations,
  medicineCatalog,
  labCatalog,
  autoRoomCharge,
  autoRoomTotal,
  runningBillTotal,
  ipInvoice,
  loading = false,
  apiSession,
  busy,
  setBusy,
  setError,
  setMessage,
  loadAdmissionWork,
  refresh,
  generateInvoice,
  postWork,
  latestConsent,
  latestDischarge,
  signConsentEntry,
  finalizeDischargeEntry,
}: any) {
  const [medicineRows, setMedicineRows] = useState(
    "Paracetamol | 500 mg | 1-0-1 | oral",
  );
  const [referralRows, setReferralRows] = useState(
    "lab | CBC | routine | Fever workup",
  );
  const [medicineTagText, setMedicineTagText] = useState("");
  const [referralTagText, setReferralTagText] = useState("");
  const [medName, setMedName] = useState("");
  const [selectedMedicineId, setSelectedMedicineId] = useState("");
  const [medDose, setMedDose] = useState("");
  const [medFrequency, setMedFrequency] = useState("1-0-1");
  const [medRoute, setMedRoute] = useState("oral");
  const [refType, setRefType] = useState("lab");
  const [selectedLabTestId, setSelectedLabTestId] = useState("");
  const [refName, setRefName] = useState("");
  const [refPriority, setRefPriority] = useState("routine");
  const [detailTab, setDetailTab] = useState<"consent" | "discharge">(
    "consent",
  );
  const [openSections, setOpenSections] = useState<any>({
    runningBill: true,
    details: false,
    history: false,
  });
  const closed = isClosedAdmission(admission);
  const consentDocuments = ipDocuments.filter(
    (doc: any) => doc.document_type === "consent",
  );
  const dischargeDocuments = ipDocuments.filter(
    (doc: any) => doc.document_type === "discharge",
  );
  const labScanBillingItems = billingItems.filter(
    (row: any) =>
      String(row.source_type || "").includes("lab") ||
      String(row.source_type || "").includes("scan"),
  );
  const medicineOptions = medicineCatalog.map((medicine: any) => ({
    value: medicine.id,
    label: medicine.name,
    item: medicine,
  }));
  const labOptions = labCatalog.map((test: any) => ({
    value: test.id,
    label: test.name,
    item: test,
  }));
  const toggleSection = (key: string) =>
    setOpenSections((state: any) => ({ ...state, [key]: !state[key] }));

  function medicineUnitAmount(name: string) {
    const key = catalogKey(name);
    const selected = medicineCatalog.find(
      (row: any) => row.id === selectedMedicineId,
    );
    const match = medicineCatalog.find(
      (row: any) =>
        catalogKey(row.name) === key ||
        catalogKey(row.code) === key ||
        catalogKey(row.generic_name) === key,
    );
    return Number((match || selected)?.default_sale_price || 0);
  }

  function labUnitAmount(name: string) {
    const key = catalogKey(name);
    const selected = labCatalog.find(
      (row: any) => row.id === selectedLabTestId,
    );
    const match = labCatalog.find(
      (row: any) =>
        catalogKey(row.name) === key || catalogKey(row.code) === key,
    );
    return Number((match || selected)?.default_price || 0);
  }

  useEffect(() => {
    if (!selectedMedicineId && medicineCatalog[0]?.id) {
      const first = medicineCatalog[0];
      setSelectedMedicineId(first.id);
      setMedName(first.name || "");
      setMedDose(first.strength || "");
    }
  }, [medicineCatalog, selectedMedicineId]);
  useEffect(() => {
    if (!selectedLabTestId && labCatalog[0]?.id) {
      const first = labCatalog[0];
      setSelectedLabTestId(first.id);
      setRefName(first.name || "");
      setRefType(
        String(first.category || first.test_type || first.sample_type || "")
          .toLowerCase()
          .includes("scan")
          ? "scan"
          : "lab",
      );
    }
  }, [labCatalog, selectedLabTestId]);

  function selectMedicine(id: string) {
    setSelectedMedicineId(id);
    const medicine = medicineCatalog.find((row: any) => row.id === id);
    if (!medicine) return;
    setMedName(medicine.name || "");
    setMedDose(medicine.strength || "");
  }

  function selectLabTest(id: string) {
    setSelectedLabTestId(id);
    const test = labCatalog.find((row: any) => row.id === id);
    if (!test) return;
    setRefName(test.name || "");
    const text = [test.category, test.test_type, test.sample_type, test.name]
      .join(" ")
      .toLowerCase();
    setRefType(
      text.includes("x-ray") ||
        text.includes("ecg") ||
        text.includes("scan") ||
        text.includes("procedure")
        ? "scan"
        : "lab",
    );
  }

  function addMedicineRow() {
    if (!medName.trim()) return;
    setMedicineRows(
      appendLine(
        medicineRows,
        [medName, medDose, medFrequency, medRoute, medicineUnitAmount(medName)]
          .map((part) => String(part || "").trim())
          .join(" | "),
      ),
    );
    setMedName("");
    setMedDose("");
  }
  function addMedicineFromText(value: string) {
    const text = String(value || "").trim();
    if (!text) return;
    const line = text.includes("|")
      ? text
      : [text, medDose, medFrequency, medRoute, medicineUnitAmount(text)]
          .map((part) => String(part || "").trim())
          .join(" | ");
    setMedicineRows((rows: string) => appendLine(rows, line));
  }
  function removeMedicineRow(index: number) {
    setMedicineRows((rows: string) =>
      splitRows(rows)
        .filter((_: string, i: number) => i !== index)
        .join("\n"),
    );
  }

  function addReferralRow() {
    if (!refName.trim()) return;
    setReferralRows(
      appendLine(
        referralRows,
        [refType, refName, refPriority, "", labUnitAmount(refName)]
          .map((part) => String(part || "").trim())
          .join(" | "),
      ),
    );
    setRefName("");
  }
  function addReferralFromText(value: string) {
    const text = String(value || "").trim();
    if (!text) return;
    const line = text.includes("|")
      ? text
      : [refType, text, refPriority, "", labUnitAmount(text)]
          .map((part) => String(part || "").trim())
          .join(" | ");
    setReferralRows((rows: string) => appendLine(rows, line));
  }
  function removeReferralRow(index: number) {
    setReferralRows((rows: string) =>
      splitRows(rows)
        .filter((_: string, i: number) => i !== index)
        .join("\n"),
    );
  }

  const { submitCare } = useIPCareActions({
    apiSession,
    admission,
    closed,
    medicineRows,
    referralRows,
    medicationOrders,
    getMedicineUnitAmount: medicineUnitAmount,
    getLabUnitAmount: labUnitAmount,
    setBusy,
    setError,
    setMessage,
    loadAdmissionWork,
    refresh,
  });

  return (
    <div className="relative grid gap-6">
      {loading && <OverlayLoader />}
      <div className="grid gap-6">
        <Card>
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
            <div>
              <h4 className="text-lg font-bold">Daily IP Care Entry</h4>
              <p className="text-sm text-slate-500">
                One entry saves the clinical round, medicines, lab/scan
                referrals, and running bill updates.
              </p>
            </div>
            <Badge tone={closed ? "green" : "blue"}>
              {closed ? "Discharged" : admission.admission_number}
            </Badge>
          </div>
          {closed && (
            <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
              This IP admission is discharged and locked. Use Invoices to view
              or collect against the final bill.
            </div>
          )}
          <form onSubmit={submitCare} className="mt-5 grid gap-4">
            <div className="grid gap-3 md:grid-cols-4">
              <FormField label="Date">
                <Input name="care_date" type="date" defaultValue={today()} />
              </FormField>
              <FormField label="Round">
                <Select name="round_type">
                  <option value="ward_round">Ward Round</option>
                  <option value="admission_visit">Admission Visit</option>
                  <option value="emergency_visit">Emergency Visit</option>
                  <option value="procedure">Procedure</option>
                  <option value="discharge_round">Discharge Round</option>
                </Select>
              </FormField>
              <FormField label="Visit Fee">
                <Input
                  name="fee_amount"
                  type="number"
                  min="0"
                  defaultValue="500"
                />
              </FormField>
              <label className="flex items-end gap-2 pb-3 text-sm font-bold text-slate-700">
                <input name="mark_given" type="checkbox" defaultChecked /> Give
                medicines now
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <FormField label="BP">
                <Input name="bp" placeholder="120/80" />
              </FormField>
              <FormField label="Pulse">
                <Input name="pulse" placeholder="78" />
              </FormField>
              <FormField label="Temp">
                <Input name="temperature" placeholder="98.6 F" />
              </FormField>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="Complaints">
                <Input name="complaints" placeholder="Current IP complaints" />
              </FormField>
              <FormField label="Diagnosis">
                <Input name="diagnosis" placeholder="Working diagnosis" />
              </FormField>
            </div>
            <FormField label="Clinical Notes">
              <textarea
                name="notes"
                required
                className="min-h-24 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none"
                placeholder="Progress, assessment, care plan, response"
              />
            </FormField>

            <div className="rounded-3xl bg-slate-50 p-4">
              <FormField label="Medicine Rows">
                <TagEntryBox
                  tags={splitRows(medicineRows)}
                  value={medicineTagText}
                  onChange={setMedicineTagText}
                  onSubmit={addMedicineFromText}
                  onRemove={removeMedicineRow}
                  getLabel={rowTagLabel}
                  placeholder="Type medicine and press Enter"
                  disabled={closed}
                  submitOnComma={false}
                />
              </FormField>
              <div className="mt-3 grid gap-2 lg:grid-cols-[1.2fr_.8fr_.7fr_.7fr_auto] lg:items-end">
                <FormField label="Medicine">
                  {medicineCatalog.length > 0 ? (
                    <SearchPicker
                      value={selectedMedicineId}
                      onChange={(medicineId: string) =>
                        selectMedicine(medicineId)
                      }
                      options={medicineOptions}
                      placeholder="Type medicine name"
                      disabled={closed}
                      onEnterQuery={(value: string, option: any) => {
                        const medicine = option?.item;
                        if (medicine) {
                          setSelectedMedicineId(medicine.id);
                          setMedName(medicine.name || "");
                          setMedicineRows((rows: string) =>
                            appendLine(
                              rows,
                              [
                                medicine.name,
                                medicine.strength || medDose,
                                medFrequency,
                                medRoute,
                                Number(medicine.default_sale_price || 0),
                              ]
                                .map((part) => String(part || "").trim())
                                .join(" | "),
                            ),
                          );
                          setMedDose("");
                        } else addMedicineFromText(value);
                      }}
                      getSearchText={(medicine: any) =>
                        [
                          medicine?.name,
                          medicine?.strength,
                          medicine?.generic_name,
                          medicine?.brand_name,
                          medicine?.category,
                        ]
                          .filter(Boolean)
                          .join(" ")
                      }
                    />
                  ) : (
                    <Input
                      value={medName}
                      onChange={(e: any) => setMedName(e.target.value)}
                      placeholder="Ceftriaxone"
                    />
                  )}
                </FormField>
                <FormField label="Dose">
                  <Input
                    value={medDose}
                    onChange={(e: any) => setMedDose(e.target.value)}
                    placeholder="1 g"
                  />
                </FormField>
                <FormField label="Freq">
                  <Select
                    value={medFrequency}
                    onChange={(e: any) => setMedFrequency(e.target.value)}
                  >
                    {[...new Set([medFrequency, ...medicineFrequencyOptions])]
                      .filter(Boolean)
                      .map((value: string) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                  </Select>
                </FormField>
                <FormField label="Route">
                  <Select
                    value={medRoute}
                    onChange={(e: any) => setMedRoute(e.target.value)}
                  >
                    <option value="oral">Oral</option>
                    <option value="iv">IV</option>
                    <option value="im">IM</option>
                    <option value="sc">SC</option>
                  </Select>
                </FormField>
                <Button
                  type="button"
                  onClick={addMedicineRow}
                  disabled={closed}
                >
                  Add
                </Button>
              </div>
              {medicineCatalog.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {medicineCatalog.slice(0, 8).map((medicine: any) => (
                    <button
                      key={medicine.id}
                      type="button"
                      onClick={() => selectMedicine(medicine.id)}
                      className="rounded-xl border bg-white px-3 py-2 text-xs font-bold"
                    >
                      {medicine.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl bg-slate-50 p-4">
              <FormField label="Lab / Scan Rows">
                <TagEntryBox
                  tags={splitRows(referralRows)}
                  value={referralTagText}
                  onChange={setReferralTagText}
                  onSubmit={addReferralFromText}
                  onRemove={removeReferralRow}
                  getLabel={rowTagLabel}
                  placeholder="Type lab / scan and press Enter"
                  disabled={closed}
                  submitOnComma={false}
                />
              </FormField>
              <div className="mt-3 grid gap-2 lg:grid-cols-[.7fr_1.2fr_.7fr_auto] lg:items-end">
                <FormField label="Type">
                  <Select
                    value={refType}
                    onChange={(e: any) => setRefType(e.target.value)}
                  >
                    <option value="lab">Lab</option>
                    <option value="scan">Scan</option>
                  </Select>
                </FormField>
                <FormField label="Item">
                  {labCatalog.length > 0 ? (
                    <SearchPicker
                      value={selectedLabTestId}
                      onChange={(testId: string) => selectLabTest(testId)}
                      options={labOptions}
                      placeholder="Type lab / scan name"
                      disabled={closed}
                      onEnterQuery={(value: string, option: any) => {
                        const test = option?.item;
                        if (test) {
                          const text = [
                            test.category,
                            test.test_type,
                            test.sample_type,
                            test.name,
                          ]
                            .join(" ")
                            .toLowerCase();
                          const sourceType =
                            text.includes("x-ray") ||
                            text.includes("ecg") ||
                            text.includes("scan") ||
                            text.includes("procedure")
                              ? "scan"
                              : "lab";
                          setSelectedLabTestId(test.id);
                          setReferralRows((rows: string) =>
                            appendLine(
                              rows,
                              [
                                sourceType,
                                test.name,
                                refPriority,
                                "",
                                Number(test.default_price || 0),
                              ]
                                .map((part) => String(part || "").trim())
                                .join(" | "),
                            ),
                          );
                          setRefName("");
                        } else addReferralFromText(value);
                      }}
                      getSearchText={(test: any) =>
                        [
                          test?.name,
                          test?.sample_type,
                          test?.category,
                          test?.code,
                        ]
                          .filter(Boolean)
                          .join(" ")
                      }
                    />
                  ) : (
                    <Input
                      value={refName}
                      onChange={(e: any) => setRefName(e.target.value)}
                      placeholder="CBC / X-Ray"
                    />
                  )}
                </FormField>
                <FormField label="Priority">
                  <Select
                    value={refPriority}
                    onChange={(e: any) => setRefPriority(e.target.value)}
                  >
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="stat">STAT</option>
                  </Select>
                </FormField>
                <Button
                  type="button"
                  onClick={addReferralRow}
                  disabled={closed}
                >
                  Add
                </Button>
              </div>
              {labCatalog.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {labCatalog.slice(0, 8).map((test: any) => (
                    <button
                      key={test.id}
                      type="button"
                      onClick={() => selectLabTest(test.id)}
                      className="rounded-xl border bg-white px-3 py-2 text-xs font-bold"
                    >
                      {test.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button disabled={closed || busy === "ip care"}>
              <ButtonLoader loading={busy === "ip care"}>
                {busy === "ip care"
                  ? "Saving..."
                  : closed
                    ? "Admission Locked"
                    : "Save IP Care Entry"}
              </ButtonLoader>
            </Button>
          </form>
        </Card>

        <Card>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setDetailTab("consent")}
              className={`rounded-xl px-3 py-2 text-sm font-bold ${detailTab === "consent" ? "bg-slate-900 text-white" : "text-slate-600"}`}
            >
              Consent Form
            </button>
            <button
              type="button"
              onClick={() => setDetailTab("discharge")}
              className={`rounded-xl px-3 py-2 text-sm font-bold ${detailTab === "discharge" ? "bg-slate-900 text-white" : "text-slate-600"}`}
            >
              Discharge Summary
            </button>
          </div>
          {detailTab === "consent" ? (
            <form
              onSubmit={(e) => postWork(e, "consent")}
              className="mt-4 grid gap-3"
            >
              <FormField label="Consent Title" required>
                <Input
                  name="title"
                  defaultValue="General IP Admission Consent"
                  required
                />
              </FormField>
              <FormField label="Consent Text" required>
                <Input
                  name="content"
                  defaultValue="Patient/guardian consent received for in-patient admission, investigation, treatment, billing, and discharge process."
                  required
                />
              </FormField>
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Guardian Name">
                  <Input
                    name="patient_or_guardian_name"
                    placeholder="Patient / guardian name"
                  />
                </FormField>
                <FormField label="Relationship">
                  <Input
                    name="relationship"
                    placeholder="Self / spouse / parent"
                  />
                </FormField>
              </div>
              <FormField label="Consent Files">
                <Input
                  name="documents"
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx"
                />
              </FormField>
              {consentDocuments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {consentDocuments.map((doc: any) => (
                    <a
                      key={doc.id}
                      href={uploadAssetUrl(doc.file_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl border px-3 py-2 text-xs font-bold text-blue-700 underline"
                    >
                      {doc.file_name}
                    </a>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button disabled={closed || busy === "consent"}>
                  <ButtonLoader loading={busy === "consent"}>
                    {busy === "consent" ? "Saving..." : "Save Consent"}
                  </ButtonLoader>
                </Button>
                <Button
                  type="button"
                  disabled={closed || !latestConsent || busy === "consent sign"}
                  onClick={() => signConsentEntry(latestConsent.id)}
                  className="bg-emerald-700"
                >
                  <ButtonLoader loading={busy === "consent sign"}>
                    {busy === "consent sign" ? "Signing..." : "Mark Signed"}
                  </ButtonLoader>
                </Button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={(e) => postWork(e, "discharge")}
              className="mt-4 grid gap-3"
            >
              <div className="grid gap-3 md:grid-cols-2">
                <FormField label="Discharge Date">
                  <Input
                    name="discharge_date"
                    type="date"
                    defaultValue={today()}
                  />
                </FormField>
                <FormField label="Final Diagnosis">
                  <Input name="final_diagnosis" required />
                </FormField>
              </div>
              <FormField label="Advice">
                <Input name="follow_up_advice" />
              </FormField>
              <FormField label="Discharge Files">
                <Input
                  name="documents"
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx"
                />
              </FormField>
              {dischargeDocuments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {dischargeDocuments.map((doc: any) => (
                    <a
                      key={doc.id}
                      href={uploadAssetUrl(doc.file_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl border px-3 py-2 text-xs font-bold text-blue-700 underline"
                    >
                      {doc.file_name}
                    </a>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button disabled={closed || busy === "discharge"}>
                  <ButtonLoader loading={busy === "discharge"}>
                    {busy === "discharge" ? "Saving..." : "Save Summary"}
                  </ButtonLoader>
                </Button>
                <Button
                  type="button"
                  disabled={
                    closed || !latestDischarge || busy === "discharge finalize"
                  }
                  onClick={() => finalizeDischargeEntry(latestDischarge.id)}
                  className="bg-emerald-700"
                >
                  <ButtonLoader loading={busy === "discharge finalize"}>
                    {closed
                      ? "Discharged"
                      : busy === "discharge finalize"
                        ? "Finalizing..."
                        : "Finalize"}
                  </ButtonLoader>
                </Button>
              </div>
            </form>
          )}
        </Card>

        <CollapsibleIPSection
          title="Running Bill"
          badge={inr(runningBillTotal)}
          summary={`${billingItems.length + charges.length + (autoRoomCharge ? 1 : 0)} bill row(s)`}
          isOpen={openSections.runningBill}
          onToggle={() => toggleSection("runningBill")}
        >
          <div className="mt-3 grid gap-2">
            {autoRoomCharge && (
              <div className="flex justify-between gap-3 rounded-xl bg-slate-50 p-2 text-sm">
                <span>Room · {autoRoomCharge.quantity} day(s)</span>
                <b>{inr(autoRoomTotal)}</b>
              </div>
            )}
            {billingItems.map((row: any) => (
              <div key={row.id} className="flex justify-between gap-3 text-sm">
                <span>{row.description}</span>
                <b>{inr(row.total_amount)}</b>
              </div>
            ))}
            {charges.map((row: any) => (
              <div key={row.id} className="flex justify-between gap-3 text-sm">
                <span>{row.description}</span>
                <b>{inr(row.total_amount)}</b>
              </div>
            ))}
            <div className="border-t pt-3 text-right text-xl font-black">
              {inr(runningBillTotal)}
            </div>
          </div>
          {ipInvoice && !closed && (
            <div className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
              <span className="font-bold">
                Invoice {ipInvoice.invoice?.invoice_number}
              </span>{" "}
              · {inr(ipInvoice.invoice?.total_amount)} ·{" "}
              <span className="uppercase">{ipInvoice.invoice?.status}</span>
            </div>
          )}
          <Button
            type="button"
            disabled={closed || runningBillTotal <= 0 || busy === "invoice"}
            onClick={generateInvoice}
            className="mt-4 w-full"
          >
            <ButtonLoader loading={busy === "invoice"}>
              {busy === "invoice"
                ? "Generating..."
                : closed
                  ? "Final Bill Locked"
                  : ipInvoice
                    ? "Regenerate IP Invoice"
                    : "Generate IP Invoice"}
            </ButtonLoader>
          </Button>
        </CollapsibleIPSection>

        <CollapsibleIPSection
          title="Medicine / Lab Details"
          badge={`${medicationOrders.length} meds · ${labScanBillingItems.length} lab/scan`}
          summary="Suggestions, active medication orders, and investigation bill rows"
          isOpen={openSections.details}
          onToggle={() => toggleSection("details")}
        >
          <div className="mt-3 grid gap-3">
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase text-slate-500">
                Medicine Suggestions
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {medicineCatalog.slice(0, 6).map((medicine: any) => (
                  <span
                    key={medicine.id}
                    className="rounded-xl bg-white px-3 py-2 text-xs font-bold"
                  >
                    {medicine.name}
                  </span>
                ))}
                {medicineCatalog.length === 0 && (
                  <span className="text-sm text-slate-500">
                    No medicine catalog loaded.
                  </span>
                )}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase text-slate-500">
                Medication Orders
              </p>
              <div className="mt-2 grid gap-2">
                {medicationOrders.slice(0, 5).map((row: any) => (
                  <div key={row.id} className="rounded-xl bg-white p-2 text-sm">
                    <b>{row.medicine_name}</b>
                    <p className="text-xs text-slate-500">
                      {[row.dosage, row.frequency, row.route, row.status]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                ))}
                {medicationOrders.length === 0 && (
                  <span className="text-sm text-slate-500">
                    No medication orders yet.
                  </span>
                )}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase text-slate-500">
                Lab / Scan Suggestions
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {labCatalog.slice(0, 6).map((test: any) => (
                  <span
                    key={test.id}
                    className="rounded-xl bg-white px-3 py-2 text-xs font-bold"
                  >
                    {test.name}
                  </span>
                ))}
                {labCatalog.length === 0 && (
                  <span className="text-sm text-slate-500">
                    No lab catalog loaded.
                  </span>
                )}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase text-slate-500">
                Lab / Scan Billing Details
              </p>
              <div className="mt-2 grid gap-2">
                {labScanBillingItems.slice(0, 5).map((row: any) => (
                  <div
                    key={row.id}
                    className="flex justify-between gap-2 rounded-xl bg-white p-2 text-sm"
                  >
                    <span>{row.description}</span>
                    <b>{inr(row.total_amount)}</b>
                  </div>
                ))}
                {labScanBillingItems.length === 0 && (
                  <span className="text-sm text-slate-500">
                    No lab/scan billing rows yet.
                  </span>
                )}
              </div>
            </div>
          </div>
        </CollapsibleIPSection>

        <CollapsibleIPSection
          title="Care History"
          badge={`${treatments.length} entries`}
          summary={`${medicationOrders.length} medication order(s), ${medicationAdministrations.length} administration(s)`}
          isOpen={openSections.history}
          onToggle={() => toggleSection("history")}
        >
          <div className="mt-3 grid gap-2">
            {treatments.slice(0, 4).map((row: any) => (
              <div key={row.id} className="rounded-2xl bg-slate-50 p-3 text-sm">
                <b>
                  {row.treatment_date} · {row.treatment_type}
                </b>
                <p className="text-slate-500">{row.notes}</p>
              </div>
            ))}
            {treatments.length === 0 && (
              <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-500">
                No care entries yet.
              </p>
            )}
          </div>
          <div className="mt-4 grid gap-2 text-sm text-slate-500">
            <p>{medicationOrders.length} medication orders</p>
            <p>{medicationAdministrations.length} medicine administrations</p>
          </div>
        </CollapsibleIPSection>
      </div>
    </div>
  );
}
