import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { getRequest } from "../../../lib/api";
import ApplicationsList from "./ApplicationsCard";

vi.mock("../../../lib/api", () => {
  const api = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  return { default: api, api, getRequest: vi.fn() };
});

let responses: Record<string, unknown>;

/** A page of the own applications as the server sends it. */
function page(results: unknown[], next: string | null = null, count = results.length) {
  return { count, next, previous: null, results };
}

/** An own application for a competition starting the given number of days from now. */
function application(id: number, name: string, days: number, has_invitation = false) {
  const start = new Date(Date.now() + 1000 * 60 * 60 * 24 * days).toISOString();
  return {
    id, user: 9, competition: id, status: has_invitation ? 2 : 0, has_invitation,
    competition_overview: {
      id, start, info: "",
      event: { id, name, start, end: null, location: { id, name: "Hall", description: "", address: 12 } },
    },
  };
}

beforeEach(() => {
  responses = {
    "/api/applications/": page([]),
    "/api/address/12/": { id: 12, street: "Main Street", house_number: "4", area_code: "3000", city: "Bern", country: "Switzerland" },
  };
  (getRequest as Mock).mockImplementation(async (url: string) => {
    if (!(url in responses)) throw new Error(`Unexpected request ${url}`);
    return responses[url];
  });
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ApplicationsList user={9} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ApplicationsList", () => {
  it("filters the applications by tab and search", async () => {
    responses["/api/applications/"] = page([
      application(1, "Zurich Cup", 30),
      application(2, "Swiss Open", 30, true),
      application(3, "Geneva Open", -30, true),
      application(4, "Basel Trophy", -30),
    ]);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/Zurich Cup/)).toBeInTheDocument();
    expect(screen.getByText(/Swiss Open/)).toBeInTheDocument();
    expect(screen.queryByText(/Geneva Open/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Basel Trophy/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Invited" }));
    expect(screen.queryByText(/Zurich Cup/)).not.toBeInTheDocument();
    expect(screen.getByText(/Swiss Open/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Past invitations" }));
    expect(screen.getByText(/Geneva Open/)).toBeInTheDocument();
    expect(screen.queryByText(/Basel Trophy/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All" }));
    for (const name of [/Zurich Cup/, /Swiss Open/, /Geneva Open/, /Basel Trophy/]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }

    await user.click(screen.getByRole("button", { name: "Upcoming" }));
    await user.type(screen.getByRole("searchbox", { name: "Search applications" }), "zurich");
    expect(screen.getByText(/Zurich Cup/)).toBeInTheDocument();
    expect(screen.queryByText(/Swiss Open/)).not.toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox", { name: "Search applications" }));
    await user.type(screen.getByRole("searchbox", { name: "Search applications" }), "nothing");
    expect(screen.getByText("No application matching “nothing”.")).toBeInTheDocument();
  });

  it("loads older applications on request", async () => {
    responses["/api/applications/"] = page([application(1, "Zurich Cup", 30)], "/api/applications/?page=2", 2);
    responses["/api/applications/?page=2"] = page([application(2, "Geneva Open", -30, true)], null, 2);
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "All" }));
    expect(screen.getByText(/Zurich Cup/)).toBeInTheDocument();
    expect(screen.queryByText(/Geneva Open/)).not.toBeInTheDocument();
    expect(screen.getByText("1 of 2 applications loaded, the latest first.")).toBeInTheDocument();
    expect(getRequest).not.toHaveBeenCalledWith("/api/applications/?page=2", expect.anything());

    await user.click(screen.getByRole("button", { name: "Load older applications" }));
    expect(await screen.findByText(/Geneva Open/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load older applications" })).not.toBeInTheDocument();
  });

  it("searches the history of applications on the server", async () => {
    responses["/api/applications/"] = page([application(1, "Zurich Cup", 30)], "/api/applications/?page=2", 30);
    const query = "?start_after=2010-01-01&start_before=2015-12-31&location=Bern+Arena&status=3&status=-3&search=kata";
    responses[`/api/applications/${query}`] = page(
      [application(7, "Swiss Open 2012", -5000, true)], `/api/applications/${query}&page=2`, 2);
    responses[`/api/applications/${query}&page=2`] = page([application(8, "Swiss Open 2011", -5400)], null, 2);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/Zurich Cup/);
    // Only the All tab searches the history.
    expect(screen.queryByRole("form", { name: "Historic search" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "All" }));
    const toggle = screen.getByRole("button", { name: "Historic search" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const form = within(screen.getByRole("form", { name: "Historic search" }));
    fireEvent.change(form.getByLabelText("Starting from"), { target: { value: "2010-01-01" } });
    fireEvent.change(form.getByLabelText("Starting until"), { target: { value: "2015-12-31" } });
    await user.type(form.getByLabelText("Location"), "Bern Arena");
    await user.click(form.getByLabelText("Status"));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Participated" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Declined" }));
    await user.type(form.getByLabelText("Text"), "kata");
    await user.click(form.getByRole("button", { name: "Search" }));

    expect(await screen.findByText(/Swiss Open 2012/)).toBeInTheDocument();
    expect(screen.queryByText(/Zurich Cup/)).not.toBeInTheDocument();
    expect(screen.getByText("2 applications found by the historic search.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Load older applications" }));
    expect(await screen.findByText(/Swiss Open 2011/)).toBeInTheDocument();

    // The other tabs keep showing the loaded applications.
    await user.click(screen.getByRole("button", { name: "Upcoming" }));
    expect(screen.getByText(/Zurich Cup/)).toBeInTheDocument();
    expect(screen.queryByText(/Swiss Open 2012/)).not.toBeInTheDocument();

    // Back in the All tab, the search is open with its criteria.
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText(/Swiss Open 2012/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Historic search" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Location")).toHaveValue("Bern Arena");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText(/Zurich Cup/)).toBeInTheDocument();
    expect(screen.queryByText(/Swiss Open 2012/)).not.toBeInTheDocument();
  });

  it("shows why the server refused a historic search", async () => {
    (getRequest as Mock).mockImplementation(async (url: string) => {
      if (url.startsWith("/api/applications/?")) {
        throw { response: { status: 400, data: { start_before: ["The end lies before the start."] } } };
      }
      if (!(url in responses)) throw new Error(`Unexpected request ${url}`);
      return responses[url];
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "All" }));
    await user.click(screen.getByRole("button", { name: "Historic search" }));
    await user.type(screen.getByLabelText("Text"), "kata");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("The end lies before the start.")).toBeInTheDocument();
  });
});
