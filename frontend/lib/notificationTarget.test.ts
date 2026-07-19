// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearNotificationTarget,
  notificationDestination,
  readNotificationTarget,
  saveNotificationTarget,
} from "./notificationTarget";

describe("notificationTarget", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("preserves the module record and exact mentioned comment", () => {
    saveNotificationTarget({
      event_type: "comment.mentioned",
      resource_type: "consultation",
      resource_id: "consultation_1",
      metadata_json: JSON.stringify({ comment_id: "comment_1" }),
    });

    const target = readNotificationTarget("consultation");
    expect(target).toEqual({
      eventType: "comment.mentioned",
      resourceType: "consultation",
      resourceId: "consultation_1",
      commentId: "comment_1",
    });
    expect(readNotificationTarget("appointment")).toBeNull();

    clearNotificationTarget(target!);
    expect(readNotificationTarget()).toBeNull();
  });

  it("corrects destinations on mention notifications created before the fix", () => {
    expect(
      notificationDestination({
        event_type: "comment.mentioned",
        resource_type: "consultation",
        action_module: "doctor",
      }),
    ).toBe("consultation");
  });
});
