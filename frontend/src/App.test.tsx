import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
  "/api/user/7": { id: 7, username: "john", first_name: "John", last_name: "Doe", referee: { address: 5 } },
  "/api/examinations/user/": [{ id: 1, candidate: 7, license: 1, passed: true, date: "2024-05-01", note_internal: "", note_external: "" }],
  "/api/applications/": [],
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

  it("lays out several competitions in a grid", async () => {
    logIn();
    renderApp("/events/2");
    expect(await screen.findByRole("heading", { name: "Zurich Cup" })).toBeInTheDocument();
    const juniors = screen.getByText("Juniors");
    const veterans = screen.getByText("Veterans");
    expect(juniors.closest(".row")).not.toBeNull();
    expect(juniors.closest(".row")).toBe(veterans.closest(".row"));
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
