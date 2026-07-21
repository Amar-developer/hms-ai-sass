// import { Field,SearchableSelect,Input,Button } from "../components/common/ui";
// import { FormField } from "../components/FormElements";



// export function AppointmentBookingForm({
//   busy,
//   doctors,
//   departmentOptions,
//   doctor,
//   doctorAvailabilityMessage,
//   hasAvailableDoctor,
//   selectedDepartmentName,
//   selectedFeeAmount,
//   supportsCustomFee,
//   isBillable,
//   customFee,
//   onSubmit,
//   onCancel,
//   state,
//   actions,
// }: any) {
//   return (
//     <div>
//       <form
//         className="mt-5 border-t border-slate-100 pt-5"
//         onSubmit={(event: any) => {
//           event.preventDefault();
//           bookAppointment();
//         }}
//       >
//         <div className="grid gap-3 md:grid-cols-4">
//           <Field label="Department">
//             <SearchableSelect
//               value={departmentId}
//               onChange={setDepartmentId}
//               searchable={departmentOptions.length > 8}
//               placeholder="Select department"
//               options={departmentOptions.map((department: any) => ({
//                 value: department.id,
//                 label: department.name,
//               }))}
//             />
//           </Field>
//           <Field label="Doctor">
//             <SearchableSelect
//               value={doctorId}
//               onChange={setDoctorId}
//               disabled={apiSession && doctors.length === 0}
//               searchable={doctors.length > 8}
//               placeholder={
//                 doctors.length === 0 ? "No doctor available" : "Select doctor"
//               }
//               options={
//                 doctors.length === 0
//                   ? [{ value: "", label: "No doctor available" }]
//                   : doctors.map((item: any) => ({
//                       value: item.id,
//                       label: item.full_name || item.name,
//                       sublabel: selectedDepartmentName
//                         ? selectedDepartmentName
//                         : undefined,
//                     }))
//               }
//             />
//           </Field>
//           <Field label="Visit Type">
//             <SearchableSelect
//               value={appointmentType}
//               onChange={() => {
//                 setAppointmentType;
//               }}
//               searchable={false}
//               options={[
//                 { value: "op", label: "OP" },
//                 { value: "follow_up", label: "Follow-up" },
//                 { value: "doctor_review", label: "Doctor Review" },
//                 {
//                   value: "fitness_certificate",
//                   label: "Fitness Certificate",
//                 },
//                 { value: "emergency", label: "Emergency" },
//               ]}
//             />
//           </Field>
//           <Field label="Appointment Date">
//             <Input
//               type="date"
//               value={appointmentDate}
//               onChange={(e: any) => setAppointmentDate(e.target.value)}
//             />
//           </Field>
//           <div className="rounded-lg bg-slate-50 p-4">
//             <p className="text-xs font-bold uppercase text-slate-500">
//               Doctor Fee
//             </p>
//             <p className="mt-1 table-data font-black">
//               {!isBillable
//                 ? "Free"
//                 : supportsCustomFee
//                   ? customFee
//                     ? `₹${Number(customFee).toLocaleString("en-IN")}`
//                     : "Set price below"
//                   : selectedFeeAmount !== undefined
//                     ? `₹${Number(selectedFeeAmount).toLocaleString("en-IN")}`
//                     : "Not configured"}
//             </p>
//             <p className="mt-1 text-[10px] lg:text-slate-500">
//               {doctorId
//                 ? doctor?.full_name || doctor?.name || "Selected doctor"
//                 : "Select doctor"}
//             </p>
//           </div>
//         </div>
//         {doctorAvailabilityMessage && (
//           <div className="mt-4 rounded-lg bg-amber-50 p-4 table-data font-semibold text-amber-800">
//             {doctorAvailabilityMessage}
//           </div>
//         )}
//         {appointmentType === "emergency" && (
//           <div className="mt-4 rounded-2xl bg-red-50 p-4">
//             <TextField
//               label="Emergency Reason"
//               value={emergencyReason}
//               onChange={setEmergencyReason}
//               placeholder="Severe pain, trauma, breathlessness"
//               className="search"
//             />
//             <p className="mt-2 text-xs font-semibold text-red-700">
//               Emergency bookings skip normal slot availability and are audited
//               as emergency overrides.
//             </p>
//           </div>
//         )}
//         {(appointmentType === "follow_up" ||
//           appointmentType === "doctor_review" ||
//           appointmentType === "fitness_certificate") && (
//           <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-2">
//             <SelectField
//               label="Billing"
//               value={isBillable ? "paid" : "free"}
//               onChange={(v) => setIsBillable(v === "paid")}
//               options={[
//                 { value: "paid", label: "Chargeable" },
//                 { value: "free", label: "Free Review" },
//               ]}
//             />
//             {isBillable && (
//               <Field label="Consultation Price (₹)">
//                 <Input
//                   type="number"
//                   min={0}
//                   value={customFee}
//                   onChange={(e: any) => setCustomFee(e.target.value)}
//                   placeholder="Set price for this visit"
//                 />
//               </Field>
//             )}
//             <FormField label="Billing Note">
//               <Input
//                 value={billingNote}
//                 onChange={setBillingNote}
//                 placeholder="Within free review period, certificate request, etc."
//               />
//             </FormField>
//           </div>
//         )}
//         {appointmentType !== "emergency" && (
//           <div className="mt-4 rounded-lg bg-blue-50 p-4 text-xs text-blue-800">
//             Consultation time will be auto-assigned from the doctor's schedule
//             when you save.
//           </div>
//         )}
//         <div className="mt-4 rounded-lg bg-slate-50 p-4">
//           <div className="flex items-baseline justify-between">
//             <h5 className="text-xs font-bold uppercase text-slate-700">
//               Intake (Optional)
//             </h5>
//             <span className="text-[10px] text-xs text-slate-500">
//               Pre-fills the doctor consultation page.
//             </span>
//           </div>
//           <div className="mt-3 grid gap-3 md:grid-cols-2">
//             <FormField label="BP">
//               <Input
//                 value={intakeBp}
//                 onChange={setIntakeBp}
//                 placeholder="120/80 mmHg"
//               />
//             </FormField>
//             <FormField label="Pulse / PR">
//               <Input
//                 value={intakePulse}
//                 onChange={setIntakePulse}
//                 placeholder="78 bpm"
//               />
//             </FormField>
//             <FormField label="SpO2">
//               <Input
//                 value={intakeSpo2}
//                 onChange={setIntakeSpo2}
//                 placeholder="98%"
//               />
//             </FormField>
//             <FormField label="Temp">
//               <Input
//                 value={intakeTemp}
//                 onChange={setIntakeTemp}
//                 placeholder="98.6°F"
//               />
//             </FormField>
//             <FormField label="Height">
//               <Input
//                 value={intakeHeight}
//                 onChange={setIntakeHeight}
//                 placeholder="170cm"
//               />
//             </FormField>
//             <FormField label="Weight">
//               <Input
//                 value={intakeWeight}
//                 onChange={setIntakeWeight}
//                 placeholder="65kg"
//               />
//             </FormField>
//             <TextareaField
//               label="Complaint Rows"
//               value={intakeComplaints}
//               onChange={setIntakeComplaints}
//               placeholder={"Fever | 2 days | medium\nCough | 1 day | mild"}
//               rows={3}
//               className="placeholder:text-xs px-2 py-2"
//             />
//           </div>
//         </div>
//         <div className="mt-5 flex flex-wrap gap-2">
//           <Button
//             disabled={busy || !hasAvailableDoctor}
//             className="save-button"
//           >
//             {busy ? "Booking..." : "Save & Generate Token"}
//           </Button>
//           <button
//             type="button"
//             onClick={closeBooking}
//             className="close-button font-bold"
//           >
//             Cancel
//           </button>
//         </div>
//       </form>
//     </div>
//   );
// };

// export default AppointmentBookingForm;
