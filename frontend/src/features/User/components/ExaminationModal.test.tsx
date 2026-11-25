import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import ExaminationCard from "./ExaminationCard";
import { getRequest } from "../../../lib/api";

vi.mock("../../../lib/api", () => {
  const api = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  return { default: api, api, getRequest: vi.fn() };
});

const exams = [
  {
    id: 1, candidate: 3, license: 10, chief_examiner: 7, date: "2024-05-01", address: 5,
    grade: 5.5, passed: true, note_internal: "Committee only", note_external: "Well done",
  },
  {
    id: 2, candidate: 3, license: 11, date: "2025-03-02", passed: false,
    note_internal: "Hidden remark", note_external: "",
  },
];

const responses: Record<string, unknown> = {
  "/api/examinations/user/": exams,
  "api/licenses/": [{ id: 10, name: "Regional", parent: null }, { id: 11, name: "National", parent: 10 }],
  "/api/referees/": [{ id: 7, name: "Anna Examiner" }],
  "/api/address/5/": { street: "Hauptstrasse", house_number: "1", area_code: "3000", city: "Bern", country: "CH" },
};

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExaminationCard user={3} />
    </QueryClientProvider>,
  );
}

describe("ExaminationModal", () => {
  beforeEach(() => {
    (getRequest as Mock).mockImplementation(async (url: string) => {
      if (url in responses) return responses[url];
      throw new Error(`unexpected ${url}`);
    });
  });

  it("shows what the candidate may see of an exam", async () => {
    const user = userEvent.setup();
    renderCard();
    const buttons = await screen.findAllByRole("button", { name: /details/i });
    expect(buttons).toHaveLength(2);
    // The examiner and address are only loaded once a modal is opened.
    expect(getRequest).not.toHaveBeenCalledWith("/api/referees/", expect.anything());

    await user.click(buttons[0]);
    const dialog = await screen.findByRole("dialog", { name: "Regional" });
    expect(within(dialog).getByText("1 May 2024")).toBeInTheDocument();
    expect(await within(dialog).findByText("Anna Examiner")).toBeInTheDocument();
    expect(await within(dialog).findByText("Hauptstrasse 1, 3000 Bern, CH")).toBeInTheDocument();
    expect(within(dialog).getByText("5.5")).toBeInTheDocument();
    expect(within(dialog).getByText(/passed/i)).toBeInTheDocument();
    expect(within(dialog).getByText("Well done")).toBeInTheDocument();
    expect(within(dialog).queryByText("Committee only")).not.toBeInTheDocument();

    await user.click(within(dialog).getByText("Close", { selector: "button" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows a failed exam without examiner or address", async () => {
    const user = userEvent.setup();
    renderCard();
    const buttons = await screen.findAllByRole("button", { name: /details/i });
    await user.click(buttons[1]);
    const dialog = await screen.findByRole("dialog", { name: "National" });
    expect(within(dialog).getByText(/failed/i)).toBeInTheDocument();
    expect(within(dialog).queryByText("Hidden remark")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Note")).not.toBeInTheDocument();
  });
});
