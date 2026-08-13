import { describe, expect, it } from "vitest";

import { opdVisitWorkflowIndex } from "./OPDVisitWorkflow";

describe("OPD visit workflow", () => {
  it("maps appointment and queue states to the visible workflow", () => {
    expect(opdVisitWorkflowIndex({ status: "scheduled" })).toBe(0);
    expect(opdVisitWorkflowIndex({ queue_status: "waiting" })).toBe(1);
    expect(opdVisitWorkflowIndex({ queue_status: "called" })).toBe(2);
    expect(opdVisitWorkflowIndex({ consultation_status: "draft" })).toBe(3);
    expect(opdVisitWorkflowIndex({ consultation_status: "signed" })).toBe(4);
  });

  it("treats completed appointment variants as complete", () => {
    expect(opdVisitWorkflowIndex({ status: "consultation_completed" })).toBe(4);
    expect(opdVisitWorkflowIndex({ queue_status: "completed" })).toBe(4);
  });
});
