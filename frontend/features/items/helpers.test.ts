import { describe, expect, it } from "vitest";

import {
  findDuplicateItem,
  itemEndpoint,
  itemFormValuesFromCatalogItem,
  normalizeItemName,
} from "./helpers";

describe("item catalog helpers", () => {
  it("detects duplicate names across item types, ignoring case and whitespace", () => {
    const rows = [
      { id: "medicine-one", type: "medicine", name: "Nursing Support" },
    ];

    expect(normalizeItemName("  NURSING   support ")).toBe("nursing support");
    expect(findDuplicateItem(rows, " nursing support ")?.id).toBe(
      "medicine-one",
    );
    expect(findDuplicateItem(rows, "Nursing Support", "medicine-one")).toBeNull();
  });

  it("routes Service items to the lab package API", () => {
    expect(itemEndpoint("lab_package")).toBe("/lab/catalog/packages");
    expect(itemEndpoint("lab_package", "package-one")).toBe(
      "/lab/catalog/packages/package-one",
    );
  });

  it("maps every catalog field into the edit form", () => {
    expect(
      itemFormValuesFromCatalogItem({
        name: "Beta HCG",
        mrp_price: 770,
        default_price: 350,
        purchase_price: 125,
        supplier_id: "supplier-neuberg",
        sample_type: "Blood",
      }),
    ).toMatchObject({
      name: "Beta HCG",
      mrp_price: "770",
      price: "350",
      purchase_price: "125",
      supplier_id: "supplier-neuberg",
      sample_type: "Blood",
    });
  });

  it("keeps zero prices when preparing an item for editing", () => {
    expect(
      itemFormValuesFromCatalogItem({
        name: "Free Service",
        mrp_price: 0,
        default_price: 0,
        purchase_price: 0,
      }),
    ).toMatchObject({
      mrp_price: "0",
      price: "0",
      purchase_price: "0",
    });
  });
});
