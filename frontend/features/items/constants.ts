export const itemTypes = [
  ["medicine", "Medicine"],
  ["lab_test", "Lab Test"],
  ["lab_package", "Service"],
  ["physio_equipment", "Physiotherapy Equipment"],
  ["home_care_service", "Home Care Service"],
  ["home_visit_service", "Home Visit Service"],
];

export const homeServiceTypes = ["home_care_service", "home_visit_service"];
export const serviceItemTypes = ["lab_package", ...homeServiceTypes];

export const modalities = [
  ["ift", "IFT / Interferential Therapy"],
  ["ultrasound", "Ultrasound Therapy"],
  ["tens", "TENS Pain Relief"],
  ["laser", "Laser Therapy"],
  ["swd", "Shortwave Diathermy"],
  ["cpm", "CPM Joint Rehabilitation"],
  ["muscle_stimulator", "Muscle Stimulator / EMS"],
  ["exercise", "Therapeutic Exercise"],
];

export const sort_type_options = [
  { value: "name", label: "Name" },
  { value: "latest", label: "Latest" },
  { value: "type", label: "Type" },
  { value: "code", label: "Code" },
  { value: "mrp", label: "MRP" },
  { value: "price", label: "Sale Price" },
];

export const price_options = [
  { value: "all", label: "All prices" },
  { value: "priced", label: "Priced only" },
  { value: "free", label: "Free / zero" },
];
