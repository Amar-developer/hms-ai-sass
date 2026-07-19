// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { NotificationCenter } from "./NotificationCenter";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

const session = {
  tenantId: "tenant_ui",
  user: {
    id: "user_admin",
    user_type: "tenant_admin",
    roles: ["tenant_admin"],
  },
};

describe("NotificationCenter", () => {
  beforeEach(() => {
    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/health") return { version: "1.0.0" };
      if (path.startsWith("/notifications/in-app?")) {
        return { items: [], total: 0, unread_count: 0 };
      }
      return {};
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it("opens a consultation mention and preserves its exact activity target", async () => {
    mockedApiFetch.mockImplementation(async (path: string, _session, options) => {
      if (path === "/health") return { version: "1.0.0" };
      if (path.startsWith("/notifications/in-app?")) {
        return {
          items: [
            {
              id: "notification_1",
              event_type: "comment.mentioned",
              category: "comment",
              priority: "normal",
              title: "Preethi mentioned you in a comment",
              message: "Please review this consultation.",
              action_module: "doctor",
              resource_type: "consultation",
              resource_id: "consultation_1",
              metadata_json: JSON.stringify({ comment_id: "comment_1" }),
              is_read: false,
              created_at: new Date().toISOString(),
            },
          ],
          total: 1,
          unread_count: 1,
        };
      }
      if (path === "/notifications/in-app/notification_1" && options?.method === "PATCH") {
        return {
          id: "notification_1",
          event_type: "comment.mentioned",
          category: "comment",
          priority: "normal",
          title: "Preethi mentioned you in a comment",
          message: "Please review this consultation.",
          action_module: "doctor",
          resource_type: "consultation",
          resource_id: "consultation_1",
          metadata_json: JSON.stringify({ comment_id: "comment_1" }),
          is_read: true,
          created_at: new Date().toISOString(),
        };
      }
      return {};
    });
    const navigatePage = vi.fn();
    render(
      <NotificationCenter apiSession={session} navigatePage={navigatePage} />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "1 unread notifications" }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: /Preethi mentioned you in a comment/i,
      }),
    );

    await waitFor(() => expect(navigatePage).toHaveBeenCalledWith("consultation"));
    expect(
      JSON.parse(
        window.sessionStorage.getItem("medizinhub.notificationTarget") || "null",
      ),
    ).toMatchObject({
      resourceType: "consultation",
      resourceId: "consultation_1",
      commentId: "comment_1",
    });
  });

  it("opens from the header and closes through reusable outside-click behavior", async () => {
    render(
      <NotificationCenter apiSession={session} navigatePage={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /unread notifications/i }));
    expect(
      await screen.findByRole("region", { name: "Notification inbox" }),
    ).toBeTruthy();

    fireEvent.mouseDown(document.body);
    await waitFor(() => {
      expect(
        screen.queryByRole("region", { name: "Notification inbox" }),
      ).toBeNull();
    });
  });

  it("shows the unread count as a red badge on the notification bell", async () => {
    mockedApiFetch.mockImplementation(async (path: string) => {
      if (path === "/health") return { version: "1.0.0" };
      if (path.startsWith("/notifications/in-app?")) {
        return { items: [], total: 3, unread_count: 3 };
      }
      return {};
    });

    render(
      <NotificationCenter apiSession={session} navigatePage={vi.fn()} />,
    );

    const bell = await screen.findByRole("button", {
      name: "3 unread notifications",
    });
    const badge = screen.getByRole("status", { name: "3 unread" });
    expect(bell.className).toContain("text-red-600");
    expect(badge.textContent).toBe("3");
    expect(badge.className).toContain("bg-red-600");
  });

  it("opens publishing in a separate modal and closes it with Escape", async () => {
    render(
      <NotificationCenter apiSession={session} navigatePage={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /unread notifications/i }));
    const publishButton = await screen.findByRole("button", {
      name: "Publish update",
    });
    fireEvent.click(publishButton);

    expect(
      await screen.findByRole("dialog", { name: "Publish product update" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("region", { name: "Notification inbox" }),
    ).toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Publish product update" }),
      ).toBeNull();
    });
  });

  it("renders the full inbox at viewport level without closing on drawer interaction", async () => {
    render(
      <NotificationCenter apiSession={session} navigatePage={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /unread notifications/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: "View full inbox" }),
    );

    const inbox = await screen.findByRole("region", {
      name: "Notification inbox",
    });
    expect(inbox.className).toContain("fixed");
    expect(inbox.parentElement?.parentElement).toBe(document.body);

    fireEvent.mouseDown(screen.getByRole("combobox"));
    expect(
      screen.getByRole("region", { name: "Notification inbox" }),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Close full notification inbox" }),
    );
    await waitFor(() => {
      expect(
        screen.queryByRole("region", { name: "Notification inbox" }),
      ).toBeNull();
    });
  });
});
