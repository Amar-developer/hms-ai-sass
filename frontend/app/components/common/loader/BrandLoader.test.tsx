// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandLoader } from "./BrandLoader";

describe("BrandLoader", () => {
  it("renders the progressively drawn MedizinHub mark", () => {
    const { container } = render(<BrandLoader />);

    expect(screen.getByRole("status", { name: "Loading MedizinHub HMS" })).toBeTruthy();
    expect(container.querySelectorAll(".brand-loader-stroke")).toHaveLength(2);
    expect(container.querySelector(".brand-loader-details")).toBeTruthy();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});
