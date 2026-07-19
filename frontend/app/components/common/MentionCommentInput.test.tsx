// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { MentionCommentInput } from "./MentionCommentInput";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);
const session = {
  tenantId: "tenant_mentions",
  email: "author@clinic.test",
  user: { id: "author_user" },
};

function MentionHarness() {
  const [value, setValue] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  return (
    <>
      <MentionCommentInput
        value={value}
        onChange={setValue}
        onMentionedUserIdsChange={setIds}
        apiSession={session}
      />
      <output data-testid="mention-ids">{ids.join(",")}</output>
    </>
  );
}

describe("MentionCommentInput", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists tenant users after @ and inserts the selected user mention", async () => {
    mockedApiFetch.mockResolvedValue([
      {
        id: "user_prakash",
        name: "Prakash Kumar",
        email: "prakash@clinic.test",
        user_type: "doctor",
      },
    ]);
    render(<MentionHarness />);

    const input = screen.getByRole("textbox", { name: "Comment" });
    fireEvent.change(input, {
      target: { value: "Please review @", selectionStart: 15 },
    });

    const user = await screen.findByRole("option", {
      name: /Prakash Kumar/i,
    });
    fireEvent.mouseDown(user);
    fireEvent.click(user);

    expect((input as HTMLTextAreaElement).value).toBe(
      "Please review @Prakash Kumar ",
    );
    expect(screen.getByTestId("mention-ids").textContent).toBe("user_prakash");
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/activity/mention-users?q=&limit=20",
      session,
    );
  });
});
