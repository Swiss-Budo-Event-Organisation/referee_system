import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import App from "./App";
import api, { getRequest } from "./lib/api";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "./lib/constants";
import { makeToken } from "./test/utils";

vi.mock("./lib/api", () => {
  const api = { get: vi.fn(), post: vi.fn() };
  return { default: api, api, getRequest: vi.fn() };
});

const location = { id: 1, name: "Dojo Bern", description: "", address: 5 };
const events = [
  {
    id: 1,
    name: "Swiss Open",
    info: "Annual tournament",
    location,
    slug: "swiss-open",
    creator: null,
    created: "2024-01-01T00:00",
    modified: "2024-01-01T00:00",
    start: "2030-12-01T09:00",
    end: "2030-12-02T18:00",
  },
  {
    id: 2,
    name: "Zurich Cup",
    info: "Regional cup",
    location: { ...location, id: 2, name: "Hall Zurich" },
    slug: "zurich-cup",
    creator: null,
    created: "2024-01-01T00:00",
    modified: "2024-01-01T00:00",
    start: "2030-11-01T09:00",
    end: null,
  },
];
const competition = {
  id: 3,
  event: 1,
  category: [1],
  competition_fields: 4,
  invitor: 7,
  desired_level: 2,
  minimum_level: 1,
  start: "2030-12-01T09:00",
  info: "Seniors",
  observers: null,
  referees: 12,
  duration: "08:00:00",
  application: true,
  application_open: null,
  application_close: null,
  head_referee: null,
  modified: "2024-01-01T00:00",
};

const responses: Record<string, unknown> = {
  "/api/events/future/": events,
  "/api/events/1": { ...events[0], competitions: [competition] },
  "/api/events/2": {
    ...events[1],
    competitions: [
      { ...competition, id: 4, event: 2, info: "Juniors" },
      { ...competition, id: 5, event: 2, info: "Veterans" },
    ],
  },
  "/api/address/5/": { street: "Main Street", house_number: "1", area_code: "3000", city: "Bern", country: "Switzerland" },
  "api/licenses/": [
    { id: 1, name: "Regional" },
    { id: 2, name: "National B" },
  ],
  "/api/user/7": {
    id: 7, username: "john", first_name: "John", last_name: "Doe", referee: { address: 5 },
    permissions: ["competition.add_event"],
  },
  "/api/examinations/user/": [{ id: 1, candidate: 7, license: 1, passed: true, date: "2024-05-01", note_internal: "", note_external: "" }],
  "/api/applications/": [],
  "/api/locations/": [location],
  "/api/categories/": [
    { id: 1, name: "National", parent: null },
    { id: 2, name: "Region 1", parent: 1 },
  ],
  "/api/referees/": [
    { id: 7, name: "John Doe" },
    { id: 8, name: "Jane Roe" },
  ],
};

function renderApp(path: string) {
  window.history.pushState({}, "", path);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

function logIn() {
  localStorage.setItem(ACCESS_TOKEN, makeToken(7));
  localStorage.setItem(REFRESH_TOKEN, "refresh-token");
}

beforeEach(() => {
  (getRequest as Mock).mockImplementation(async (url: string) => {
    if (!(url in responses)) throw new Error(`Unexpected request ${url}`);
    return responses[url];
  });
});

describe("App", () => {
  it("redirects anonymous users to the login page", async () => {
    renderApp("/events/");
    expect(await screen.findByRole("heading", { name: "Login" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/login");
    expect(screen.queryByRole("link", { name: "Profile" })).not.toBeInTheDocument();
  });

  it("logs in and shows the events", async () => {
    const access = makeToken(7);
    (api.post as Mock).mockResolvedValue({ data: { access, refresh: "refresh-token" } });
    renderApp("/login");
    const user = userEvent.setup();
    await user.type(await screen.findByPlaceholderText("Username"), "john");
    await user.type(screen.getByPlaceholderText("Password"), "s3cret");
    await user.click(screen.getByRole("button", { name: "Login" }));

    expect(await screen.findByRole("heading", { name: "Upcoming Events" })).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/api/token/", { username: "john", password: "s3cret" });
    expect(localStorage.getItem(ACCESS_TOKEN)).toBe(access);
    expect(screen.getByRole("link", { name: "Profile" })).toBeInTheDocument();
  });

  it("lists and filters upcoming events", async () => {
    logIn();
    renderApp("/events/");
    expect(await screen.findByText("Swiss Open")).toBeInTheDocument();
    expect(screen.getByText("Zurich Cup")).toBeInTheDocument();
    expect(await screen.findByText(/Dojo Bern \(Bern\)/)).toBeInTheDocument();
    expect(screen.getByText("1 Dec 2030 - 2 Dec 2030")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Search Events"), "zurich");
    await waitFor(() => expect(screen.queryByText("Swiss Open")).not.toBeInTheDocument(), {
      timeout: 2000,
    });
    expect(screen.getByText("Zurich Cup")).toBeInTheDocument();
  });

  it("opens the event detail and applies for a competition", async () => {
    (api.post as Mock).mockResolvedValue({ status: 201 });
    logIn();
    renderApp("/events/");
    const user = userEvent.setup();
    const [details] = await screen.findAllByRole("button", { name: "Details" });
    await user.click(details);

    expect(await screen.findByRole("heading", { name: "Swiss Open" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/events/1");
    expect(screen.getByText("Seniors")).toBeInTheDocument();
    expect(screen.getByText("Mats: 4")).toBeInTheDocument();
    expect(screen.getByText("Referees: 12")).toBeInTheDocument();
    expect(screen.queryByText(/Observers/)).not.toBeInTheDocument();
    expect(await screen.findByText("License: National B (minimum: Regional)")).toBeInTheDocument();
    expect(await screen.findByText(/Main Street 1/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(api.post).toHaveBeenCalledWith("/api/applications/", { competition: 3, user: 7 });
    expect(await screen.findByText("Your application was received and registered.")).toBeInTheDocument();
  });

  it("shows when registration is closed instead of the apply button", async () => {
    responses["/api/events/1"] = {
      ...events[0],
      competitions: [{ ...competition, application_close: "2020-01-01T00:00" }],
    };
    try {
      logIn();
      renderApp("/events/1");
      expect(await screen.findByText("Registration is closed.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
    } finally {
      responses["/api/events/1"] = { ...events[0], competitions: [competition] };
    }
  });

  it("shows when no license is required", async () => {
    responses["/api/events/1"] = {
      ...events[0],
      competitions: [{ ...competition, minimum_level: null }],
    };
    try {
      logIn();
      renderApp("/events/1");
      expect(await screen.findByText("License: National B (no license required)")).toBeInTheDocument();
    } finally {
      responses["/api/events/1"] = { ...events[0], competitions: [competition] };
    }
  });

  it("lays out several competitions in a grid", async () => {
    logIn();
    renderApp("/events/2");
    expect(await screen.findByRole("heading", { name: "Zurich Cup" })).toBeInTheDocument();
    const juniors = screen.getByText("Juniors");
    const veterans = screen.getByText("Veterans");
    expect(juniors.closest(".row")).not.toBeNull();
    expect(juniors.closest(".row")).toBe(veterans.closest(".row"));
  });

  it("creates an event with several competition days", async () => {
    (api.post as Mock).mockResolvedValue({ data: { id: 1, name: "Swiss Open" } });
    logIn();
    renderApp("/events/new");
    const user = userEvent.setup();
    expect(await screen.findByRole("heading", { name: "New Event" })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Name/), "Swiss Open");
    await user.selectOptions(screen.getByLabelText("Venue"), "Dojo Bern");

    const day1 = within(screen.getByRole("region", { name: "Day 1" }));
    fireEvent.change(day1.getByLabelText(/^Date/), { target: { value: "2030-12-01" } });
    await user.click(day1.getByLabelText(/^Categories/));
    await user.type(screen.getByLabelText("Search categories"), "reg");
    expect(screen.queryByRole("menuitemcheckbox", { name: "National" })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Search categories"));
    const national = screen.getByRole("menuitemcheckbox", { name: "National" });
    expect(national).toHaveAttribute("aria-checked", "false");
    await user.click(national);
    expect(national).toHaveAttribute("aria-checked", "true");
    expect(national.querySelector(".bi-check-lg")).not.toHaveClass("invisible");
    expect(day1.getByLabelText(/^Categories/)).toHaveTextContent("National");
    await user.click(day1.getByRole("button", { name: "Now" }));
    expect(day1.getByLabelText("Registration opens")).not.toHaveValue("");
    await user.selectOptions(day1.getByLabelText(/^Invited by/), "John Doe");
    await user.selectOptions(day1.getByLabelText(/^Minimum license/), "Regional");
    expect(day1.getByLabelText(/^Desired license/)).toHaveValue("1");
    await user.selectOptions(day1.getByLabelText(/^Desired license/), "National B");
    await user.type(day1.getByLabelText("Referees needed"), "12");
    expect(day1.getByText(/Sunday \(1 Dec\)/)).toBeInTheDocument();

    await user.click(day1.getByRole("button", { name: /Copy to next day/ }));
    const day2 = within(screen.getByRole("region", { name: "Day 2" }));
    expect(day2.getByLabelText(/^Date/)).toHaveValue("2030-12-02");
    await user.clear(day2.getByLabelText("Referees needed"));
    await user.type(day2.getByLabelText("Referees needed"), "8");

    await user.click(screen.getByRole("button", { name: "Create event" }));

    await waitFor(() => expect(window.location.pathname).toBe("/events/1"));
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, payload] = (api.post as Mock).mock.calls[0];
    expect(url).toBe("/api/events/create/");
    expect(payload).toMatchObject({ name: "Swiss Open", location: 1 });
    expect(payload.competitions).toEqual([
      expect.objectContaining({ start: "2030-12-01T09:00", duration: "08:00:00", category: [1], invitor: 7, minimum_level: 1, desired_level: 2, referees: 12 }),
      expect.objectContaining({ start: "2030-12-02T09:00", category: [1], referees: 8 }),
    ]);
  });

  it("highlights missing fields instead of submitting", async () => {
    logIn();
    renderApp("/events/new");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add competition day" }));
    expect(screen.getByRole("region", { name: "Day 2" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Day 2" }));
    expect(screen.queryByRole("region", { name: "Day 2" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create event" }));

    expect(await screen.findByText("Please correct the highlighted fields.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveClass("is-invalid");
    expect(screen.getByText("Choose at least one category.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("refuses the event creation page without the permission", async () => {
    const getUser7 = (getRequest as Mock).getMockImplementation()!;
    (getRequest as Mock).mockImplementation(async (url: string, signal: AbortSignal) =>
      url === "/api/user/7" ? { ...(responses[url] as object), permissions: [] } : getUser7(url, signal),
    );
    logIn();
    renderApp("/events/new");
    expect(await screen.findByText(/don't have the permission to create events/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "New Event" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New Event" })).not.toBeInTheDocument();
  });

  it("shows the New Event link with the permission", async () => {
    logIn();
    renderApp("/events/");
    expect(await screen.findByRole("link", { name: "New Event" })).toBeInTheDocument();
  });

  it("asks for a new location when none exist yet", async () => {
    const getLocations = (getRequest as Mock).getMockImplementation()!;
    (getRequest as Mock).mockImplementation(async (url: string, signal: AbortSignal) =>
      url === "/api/locations/" ? [] : getLocations(url, signal),
    );
    logIn();
    renderApp("/events/new");
    expect(await screen.findByLabelText("New location")).toBeChecked();
    expect(screen.getByLabelText("Existing location")).toBeDisabled();
    expect(screen.getByLabelText(/^Venue name/)).toBeInTheDocument();
  });

  it("shows errors returned by the server", async () => {
    (api.post as Mock).mockRejectedValue(
      Object.assign(new Error("Bad Request"), {
        isAxiosError: true,
        response: { status: 400, data: { competitions: { 0: { invitor: ["Invalid referee."] } } } },
      }),
    );
    logIn();
    renderApp("/events/new");
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText("New location"));
    await user.type(screen.getByLabelText(/^Name/), "Zurich Cup");
    await user.type(screen.getByLabelText(/^Venue name/), "Hall Zurich");
    await user.type(screen.getByLabelText(/^Street/), "Hallenstrasse");
    await user.type(screen.getByLabelText(/^City/), "Zurich");
    const day1 = within(screen.getByRole("region", { name: "Day 1" }));
    fireEvent.change(day1.getByLabelText(/^Date/), { target: { value: "2030-12-01" } });
    await user.click(day1.getByLabelText(/^Categories/));
    await user.type(screen.getByLabelText("Search categories"), "region{Enter}");
    expect(day1.getByLabelText(/^Categories/)).toHaveTextContent("Region 1");
    expect(window.location.pathname).toBe("/events/new");
    await user.selectOptions(day1.getByLabelText(/^Invited by/), "Jane Roe");
    await user.selectOptions(day1.getByLabelText(/^Minimum license/), "Regional");

    await user.click(screen.getByRole("button", { name: "Create event" }));

    expect(await screen.findByText("Invalid referee.")).toBeInTheDocument();
    const [, payload] = (api.post as Mock).mock.calls[0];
    expect(payload.new_location).toMatchObject({ name: "Hall Zurich", address: { city: "Zurich" } });
    expect(window.location.pathname).toBe("/events/new");
  });

  it("shows the profile", async () => {
    logIn();
    renderApp("/profile");
    expect(await screen.findByRole("heading", { name: "John Doe (john)" })).toBeInTheDocument();
    expect(await screen.findByText("Address")).toBeInTheDocument();
    expect(await screen.findByText(/Regional \(2024-05-01\)/)).toBeInTheDocument();
    expect(screen.getByLabelText("passed")).toBeInTheDocument();
  });

  it("toggles the theme", async () => {
    renderApp("/login");
    const toggle = await screen.findByLabelText("Change Theme Colour");
    expect(document.documentElement).toHaveAttribute("data-bs-theme", "light");
    await userEvent.click(toggle);
    expect(document.documentElement).toHaveAttribute("data-bs-theme", "dark");
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("logs out", async () => {
    logIn();
    renderApp("/logout");
    expect(await screen.findByRole("heading", { name: "Login" })).toBeInTheDocument();
    expect(localStorage.getItem(ACCESS_TOKEN)).toBeNull();
  });

  it("shows a 404 page", async () => {
    logIn();
    renderApp("/does-not-exist");
    expect(await screen.findByRole("heading", { name: "404 Site not found" })).toBeInTheDocument();
  });
});
