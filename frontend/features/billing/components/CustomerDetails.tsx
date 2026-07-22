import React from "react";
import { FieldRow } from "./FieldRow";

const CustomerDetails = ({customer,company,invoiceDate,invoiceNo}) => {
  console.log(customer,'customer')
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 ">
      <div className="border-b-2 border-[#25FF46] sm:border-b-0 sm:border-r-2 pb-2">
        <h2 className="mb-2 pb-5 flex justify-center items-center text-sm font-bold border-b-2 py-1 border-[#25FF46]">
          Customer Details
        </h2>
        <div className="space-y-1 px-2">
          <FieldRow label="Name" value={customer.name} />
          <FieldRow label="Patient ID" value={customer.patientId} />
          <FieldRow label="Phone No." value={customer.phone} />
          <FieldRow label="WhatsApp No." value={customer.whatsapp} />
          <FieldRow label="Address" value={customer.address} />
        </div>
      </div>
      <div className="">
        <h2 className="mb-2 pb-5 flex justify-center items-center text-sm font-bold border-b-2 py-1 border-[#25FF46]">
          GSTIN : {company.gstin}
        </h2>
        <div className="mt-2 space-y-1 px-2">
          <FieldRow label="Invoice No." value={invoiceNo} />
          <FieldRow label="Invoice Date" value={invoiceDate} />
        </div>
      </div>
    </div>
  );
};

export default CustomerDetails;
