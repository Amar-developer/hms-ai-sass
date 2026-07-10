import { isActivePatientRecord,patientPickerLabel } from "@/features/patients/helpers";
import { useEffect, useState } from "react";
import { Select,SearchableSelect,Input } from "@/app/components/common/ui";
import { FormField } from "@/app/components/FormElements";
import { inr } from "@/utils/helper";

export function AdmissionFields({
  patients,
  departmentId,
  rooms = [],
  admissionDate,
  setAdmissionDate,
  expectedDischargeDate,
  setExpectedDischargeDate,
  hidePatient = false,
}: any) {
  const availableRooms = rooms.filter((room: any) => room.available);
  const wardNames = Array.from(
    new Set(rooms.map((room: any) => room.ward_name).filter(Boolean)),
  );
  const [ward, setWard] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [roomId, setRoomId] = useState("");
  const [patientId, setPatientId] = useState("");
  const wardRooms = rooms.filter(
    (room: any) => !ward || room.ward_name === ward,
  );
  const roomNumbers = Array.from(
    new Set(wardRooms.map((room: any) => room.room_number).filter(Boolean)),
  );
  const bedRows = wardRooms.filter(
    (room: any) => !roomNumber || room.room_number === roomNumber,
  );
  const selectedRoom =
    rooms.find((room: any) => room.id === roomId) ||
    bedRows.find((room: any) => room.available) ||
    availableRooms[0] ||
    rooms[0];
  const selectedBed = rooms.find((room: any) => room.id === roomId);
  useEffect(() => {
    if (!rooms.length) return;
    const next = selectedRoom || rooms[0];
    if (!ward) setWard(next.ward_name || "");
    if (!roomNumber) setRoomNumber(next.room_number || "");
    if (!roomId && next.available) setRoomId(next.id);
  }, [rooms.length, ward, roomNumber, roomId, selectedRoom?.id]);
  useEffect(() => {
    const nextRoom =
      rooms.find((room: any) => room.ward_name === ward && room.available) ||
      rooms.find((room: any) => room.ward_name === ward);
    setRoomNumber(nextRoom?.room_number || "");
    setRoomId(nextRoom?.available ? nextRoom.id : "");
  }, [ward]);
  useEffect(() => {
    const nextBed = rooms.find(
      (room: any) =>
        room.ward_name === ward &&
        room.room_number === roomNumber &&
        room.available,
    );
    setRoomId(nextBed?.id || "");
  }, [roomNumber, ward]);
  return (
    <>
      {!hidePatient && (
        <FormField label="Patient">
          <SearchableSelect
            name="patient_id"
            value={patientId}
            onChange={setPatientId}
            placeholder="Select patient"
            searchPlaceholder="Search patient by name, mobile, or number"
            options={patients.filter(isActivePatientRecord).map((p: any) => ({
              value: p.id,
              label: patientPickerLabel(p),
              sublabel: p.mobile || p.patient_number || p.patientNumber || p.id,
            }))}
          />
        </FormField>
      )}
      <input type="hidden" name="department_id" value={departmentId || ""} />
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Admission Date">
          <Input
            name="admission_date"
            type="date"
            value={admissionDate}
            onChange={(e: any) => setAdmissionDate(e.target.value)}
            required
          />
        </FormField>
        <FormField label="Planned Discharge">
          <Input
            name="expected_discharge_date"
            type="date"
            value={expectedDischargeDate}
            min={admissionDate}
            onChange={(e: any) => setExpectedDischargeDate(e.target.value)}
          />
        </FormField>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Aadhaar Number">
          <Input
            name="aadhaar_number"
            inputMode="numeric"
            pattern="\d{12}"
            maxLength={12}
            placeholder="12 digit Aadhaar number"
          />
        </FormField>
        <FormField label="Admission File">
          <input
            name="admission_document"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
            className="block w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-bold"
          />
        </FormField>
      </div>
      {rooms.length > 0 ? (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <FormField label="Ward">
              <Select
                value={ward}
                onChange={(e: any) => setWard(e.target.value)}
                required
              >
                {wardNames.map((name: any) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Room">
              <Select
                value={roomNumber}
                onChange={(e: any) => setRoomNumber(e.target.value)}
                required
              >
                <option value="">Select room</option>
                {roomNumbers.map((number: any) => (
                  <option key={number} value={number}>
                    Room {number}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Bed">
              <Select
                name="room_id"
                value={roomId}
                onChange={(e: any) => setRoomId(e.target.value)}
                required
              >
                <option value="">Select bed by availability</option>
                {bedRows.map((room: any) => (
                  <option
                    key={room.id}
                    value={room.id}
                    disabled={!room.available}
                  >
                    {room.bed_number} ·{" "}
                    {room.available ? "Available" : "Occupied"} ·{" "}
                    {inr(room.daily_rate)}/day
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="grid gap-2 rounded-2xl bg-slate-50 p-3 text-sm sm:grid-cols-3">
            <div>
              <b>{availableRooms.length}</b> available bed(s)
            </div>
            <div>
              <b>{Math.max(rooms.length - availableRooms.length, 0)}</b>{" "}
              occupied bed(s)
            </div>
            <div
              className={
                selectedBed?.available ? "text-emerald-700" : "text-amber-700"
              }
            >
              {selectedBed
                ? `Selected ${selectedBed.bed_number}: ${selectedBed.available ? "available" : "occupied"}`
                : "Select an available bed"}
            </div>
          </div>
          <input
            type="hidden"
            name="ward"
            value={selectedRoom?.ward_name || "General Ward"}
          />
          <input
            type="hidden"
            name="room"
            value={selectedRoom?.room_number || ""}
          />
          <input
            type="hidden"
            name="bed"
            value={selectedRoom?.bed_number || ""}
          />
          {availableRooms.length === 0 && (
            <div className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-700">
              No beds are available for the selected date range in this branch.
            </div>
          )}
        </>
      ) : (
        <>
          <div className="rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-700">
            No IP room master is configured for this branch. Add ward/room/bed
            records from the backend room API before using availability-based
            admission.
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Ward">
              <Select name="ward">
                <option>General Ward</option>
                <option>Private Room</option>
                <option>ICU</option>
                <option>Emergency Ward</option>
              </Select>
            </FormField>
            <FormField label="Bed">
              <Input name="bed" required />
            </FormField>
          </div>
          <FormField label="Room">
            <Input name="room" />
          </FormField>
        </>
      )}
      <FormField label="Reason">
        <Input name="reason" placeholder="Reason for IP admission" />
      </FormField>
      <FormField label="Provisional Diagnosis">
        <Input name="provisional_diagnosis" />
      </FormField>
    </>
  );
}
