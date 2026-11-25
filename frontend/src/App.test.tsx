import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import App from "./App";
import api, { getRequest } from "./lib/api";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "./lib/constants";
import { makeToken } from "./test/utils";

vi.mock("./lib/api", () => {
  const api = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
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
  "/api/events/1/edit/": { id: 1, name: "Swiss Open", info: "Annual tournament", location: 1, competitions: [competition] },
  "/api/events/1/applications/": [
    { id: 9, user: 8, name: "Jane Roe", competition: 3, status: 0, status_display: "Applied", created: "2030-10-02T10:00:00+02:00" },
  ],
  "/api/address/5/": { street: "Main Street", house_number: "1", area_code: "3000", city: "Bern", country: "Switzerland" },
  "api/licenses/": [
    { id: 1, name: "Regional" },
    { id: 2, name: "National B" },
  ],
  "/api/user/7": {
    id: 7, username: "john", first_name: "John", last_name: "Doe", referee: { address: 5 },
    permissions: ["competition.add_event"],
  },
  "/api/examinations/user/": [{ id: 1, candidate: 7, license: 1, passed: true, date: "2024-05-01", note_external: "" }],
  "/api/applications/": [],
  "/api/locations/": [location],
  "/api/categories/": [
    { id: 1, name: "National", parent: null },
    { id: 2, name: "Region 1", parent: 1 },
  ],
  "/api/referees/": [
    { id: 7, user: 7, name: "John Doe" },
    { id: 8, user: 18, name: "Jane Roe" },
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

    await user.click(screen.getByRole("button", { name: "Save" }));

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

  it("cancels the creation", async () => {
    logIn();
    renderApp("/events/new");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("link", { name: "Cancel" }));
    expect(await screen.findByRole("heading", { name: "Upcoming Events" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/events");
  });

  it("creates an event and continues on its edit page", async () => {
    (api.post as Mock).mockResolvedValue({ data: { id: 1, name: "Swiss Open" } });
    logIn();
    renderApp("/events/new");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^Name/), "Swiss Open");
    await user.selectOptions(screen.getByLabelText("Venue"), "Dojo Bern");
    const day1 = within(screen.getByRole("region", { name: "Day 1" }));
    fireEvent.change(day1.getByLabelText(/^Date/), { target: { value: "2030-12-01" } });
    await user.click(day1.getByLabelText(/^Categories/));
    await user.type(screen.getByLabelText("Search categories"), "national{Enter}");
    await user.selectOptions(day1.getByLabelText(/^Invited by/), "John Doe");
    await user.selectOptions(day1.getByLabelText(/^Desired license/), "National B");

    await user.click(screen.getByRole("button", { name: "Save and edit" }));

    expect(await screen.findByRole("heading", { name: "Edit Swiss Open" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/events/1/edit");
  });

  it("links to the edit page for those who may edit", async () => {
    logIn();
    responses["/api/events/1"] = { ...events[0], competitions: [competition], can_edit: true };
    try {
      renderApp("/events/1");
      const user = userEvent.setup();
      await user.click(await screen.findByRole("link", { name: "Edit" }));
      expect(await screen.findByRole("heading", { name: "Edit Swiss Open" })).toBeInTheDocument();
    } finally {
      responses["/api/events/1"] = { ...events[0], competitions: [competition] };
    }
  });

  describe("event details", () => {
    const applications = [
      { id: 11, user: 9, name: "Ana Bern", competition: 3, status: 1, status_display: "Selected", created: "2030-10-01T10:00:00+02:00" },
      { id: 9, user: 8, name: "Jane Roe", competition: 3, status: 0, status_display: "Applied", created: "2030-10-02T10:00:00+02:00" },
      { id: 12, user: 10, name: "Joe Rex", competition: 3, status: -3, status_display: "Declined", created: "2030-10-03T10:00:00+02:00" },
    ];

    function withEvent(extra: object) {
      const previous = { ...responses };
      responses["/api/events/1"] = { ...events[0], competitions: [competition], ...extra };
      responses["/api/events/1/applications/"] = applications;
      return () => Object.assign(responses, previous);
    }

    it("shows View details and Edit to admins", async () => {
      const restore = withEvent({ can_edit: true, can_view_details: true });
      try {
        logIn();
        renderApp("/events/1");
        expect(await screen.findByRole("link", { name: "View details" })).toHaveAttribute("href", "/events/1/details");
        expect(screen.getByRole("link", { name: "Edit" })).toBeInTheDocument();
      } finally {
        restore();
      }
    });

    it("shows only View details to observers", async () => {
      const restore = withEvent({ can_edit: false, can_view_details: true });
      try {
        logIn();
        renderApp("/events/1");
        const user = userEvent.setup();
        await user.click(await screen.findByRole("link", { name: "View details" }));

        const day = within(await screen.findByRole("region", { name: /^Details/ }));
        expect(day.getByText("Invited by").nextSibling).toHaveTextContent("John Doe");
        expect(day.getByText("Desired license").nextSibling).toHaveTextContent("National B");
        expect(day.getByText("Mats").nextSibling).toHaveTextContent("4");
        expect(day.getByText("National")).toBeInTheDocument();
        const rows = day.getAllByRole("row").slice(1).map((row) => row.textContent);
        expect(rows).toEqual([
          expect.stringContaining("Ana BernSelected"),
          expect.stringContaining("Jane RoeApplied"),
          expect.stringContaining("Joe RexDeclined"),
        ]);
        // Nothing to edit.
        expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Add an application")).not.toBeInTheDocument();
        expect(screen.queryByRole("textbox", { name: /^Name/ })).not.toBeInTheDocument();
      } finally {
        restore();
      }
    });

    it("filters the applications by referee name", async () => {
      const restore = withEvent({ can_view_details: true });
      try {
        logIn();
        renderApp("/events/1/details");
        const user = userEvent.setup();
        const search = await screen.findByRole("searchbox", { name: "Search referee" });

        await user.type(search, "jo");
        const day = within(screen.getByRole("region", { name: /^Details/ }));
        expect(day.queryByText("Ana Bern")).not.toBeInTheDocument();
        expect(day.getAllByRole("row")).toHaveLength(2);
        expect(day.getByText("1 of 3 match")).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("1 application matching “jo”.");
        expect(day.getByText("Jo", { selector: "mark" })).toBeInTheDocument();

        await user.clear(search);
        await user.type(search, "nobody");
        expect(screen.getByRole("status")).toHaveTextContent("No application from a referee matching “nobody”.");
        expect(day.getByText(/No referee matching “nobody” applied/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Clear" }));
        expect(day.getAllByRole("row")).toHaveLength(4);
      } finally {
        restore();
      }
    });

    it("refuses the details without the permission", async () => {
      const restore = withEvent({ can_view_details: false });
      try {
        logIn();
        renderApp("/events/1/details");
        expect(await screen.findByText(/don't have the permission to see the details/)).toBeInTheDocument();
      } finally {
        restore();
      }
    });
  });

  describe("invitation", () => {
    const invitation = {
      competition: {
        id: 3, event: 1, event_name: "Swiss Open", location: "Dojo Bern", start: "2030-12-01T09:00",
        end: "2030-12-01T17:00", info: "Seniors", invitor: 7, head_referee: null, referees: 12,
      },
      invitation: {
        id: null, subject: "Invitation: Swiss Open (01.12.2030)", message: "", referees: [],
        head_referee: null, copy_users: [], copy_emails: [], created: null, modified: null, sent: null,
      },
      last_sent: null,
      applications: [
        { id: 9, user: 8, name: "Jane Roe", status: 0, status_display: "Applied", created: "2030-10-02T10:00:00+02:00", has_email: false, selectable: true },
        { id: 12, user: 10, name: "Joe Rex", status: -2, status_display: "Cancelled", created: "2030-10-03T10:00:00+02:00", has_email: true, selectable: false },
      ],
    };

    function withInvitation() {
      const previous = { ...responses };
      responses["/api/competition/3/invitation/"] = invitation;
      return () => {
        Object.keys(responses).forEach((key) => delete responses[key]);
        Object.assign(responses, previous);
      };
    }

    it("links the invitor to the invitation", async () => {
      const restore = withInvitation();
      responses["/api/events/1"] = { ...events[0], competitions: [{ ...competition, can_invite: true }] };
      try {
        logIn();
        renderApp("/events/1");
        const user = userEvent.setup();
        await user.click(await screen.findByRole("link", { name: "Invitation" }));
        expect(await screen.findByRole("heading", { name: "Invitation" })).toBeInTheDocument();
        expect(window.location.pathname).toBe("/competitions/3/invitation");
      } finally {
        restore();
      }
    });

    it("hides the invitation from others", async () => {
      logIn();
      renderApp("/events/1");
      expect(await screen.findByRole("heading", { name: "Swiss Open" })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Invitation" })).not.toBeInTheDocument();
    });

    it("selects applicants, adds a referee and saves", async () => {
      const restore = withInvitation();
      (api.put as Mock).mockResolvedValue({ data: invitation });
      try {
        logIn();
        renderApp("/competitions/3/invitation");
        const user = userEvent.setup();

        expect(await screen.findByText("no e-mail address")).toBeInTheDocument();
        // Cancelled applications can't be invited.
        expect(screen.getByRole("checkbox", { name: "Invite Joe Rex" })).toBeDisabled();
        expect(screen.queryByText(/As a staff member/)).not.toBeInTheDocument();
        await user.click(screen.getByRole("checkbox", { name: "Invite Jane Roe" }));
        await user.selectOptions(screen.getByLabelText("Add a referee who did not apply"), "John Doe");
        await user.click(screen.getByRole("button", { name: "Add" }));
        expect(screen.getByRole("checkbox", { name: "Invite John Doe" })).toBeChecked();
        await user.click(screen.getByRole("radio", { name: "John Doe as head referee" }));

        const preview = within(screen.getByLabelText("E-mail preview"));
        expect(preview.queryByText(/Head referee:/)).not.toBeInTheDocument();
        expect(preview.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
          "John Doe (head referee)",
          "Jane Roe",
        ]);

        expect(screen.getByLabelText("Message")).toHaveAccessibleDescription(/start your message without one/);
        await user.type(screen.getByLabelText("Message"), "See you there.");
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
        expect(api.put).toHaveBeenCalledWith("/api/competition/3/invitation/", {
          referees: [8, 7],
          head_referee: 7,
          subject: "Invitation: Swiss Open (01.12.2030)",
          message: "See you there.",
          copy_users: [],
          copy_emails: [],
        });
        expect(await screen.findByText("The invitation was saved.")).toBeInTheDocument();
      } finally {
        restore();
      }
    });

    it("sends the invitation after confirming", async () => {
      const restore = withInvitation();
      responses["/api/competition/3/invitation/"] = {
        ...invitation,
        invitation: { ...invitation.invitation, referees: [8], head_referee: 8 },
      };
      const sent = { ...invitation, last_sent: { ...invitation.invitation, sent: "2030-11-01T10:00:00+01:00" }, missing_email: ["Jane Roe"] };
      (api.post as Mock).mockResolvedValue({ data: sent });
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      try {
        logIn();
        renderApp("/competitions/3/invitation");
        const user = userEvent.setup();
        await user.click(await screen.findByRole("button", { name: "Send invitation" }));

        expect(confirm).toHaveBeenCalledWith("Send the invitation to 1 referee?");
        await waitFor(() =>
          expect(api.post).toHaveBeenCalledWith("/api/competition/3/invitation/send/", expect.objectContaining({ referees: [8], head_referee: 8 })),
        );
        expect(await screen.findByText("The invitation was sent.")).toBeInTheDocument();
        expect(await screen.findByText(/no e-mail for: Jane Roe/)).toBeInTheDocument();
        expect(await screen.findByRole("button", { name: "Send update" })).toBeInTheDocument();
      } finally {
        confirm.mockRestore();
        restore();
      }
    });

    it("adds users and e-mail addresses as further recipients", async () => {
      const restore = withInvitation();
      (api.put as Mock).mockResolvedValue({ data: invitation });
      try {
        logIn();
        renderApp("/competitions/3/invitation");
        const user = userEvent.setup();

        await user.selectOptions(await screen.findByLabelText("Add a user as recipient"), "Jane Roe");
        await user.click(screen.getByRole("button", { name: "Add user" }));
        const address = screen.getByLabelText("Add an e-mail address as recipient");
        await user.type(address, "not-an-address{Enter}");
        expect(screen.getByText("Enter a valid e-mail address.")).toBeInTheDocument();
        await user.clear(address);
        await user.type(address, "office@example.ch{Enter}");
        await user.type(address, "OFFICE@example.ch");
        await user.click(screen.getByRole("button", { name: "Add address" }));
        expect(screen.getByText("This address was already added.")).toBeInTheDocument();

        const list = within(screen.getByRole("list", { name: "Further recipients" }));
        expect(list.getAllByRole("listitem").map((li) => li.textContent?.trim())).toEqual(["Jane Roe", "office@example.ch"]);
        // Enter added the address without saving the invitation.
        expect(api.put).not.toHaveBeenCalled();

        await user.click(list.getByRole("button", { name: "Remove Jane Roe" }));
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() =>
          expect(api.put).toHaveBeenCalledWith(
            "/api/competition/3/invitation/",
            expect.objectContaining({ copy_users: [], copy_emails: ["office@example.ch"] }),
          ),
        );
      } finally {
        restore();
      }
    });

    it("lets staff invite cancelled applications", async () => {
      const restore = withInvitation();
      responses["/api/competition/3/invitation/"] = {
        ...invitation,
        applications: invitation.applications.map((a) => ({ ...a, selectable: true })),
      };
      (api.put as Mock).mockResolvedValue({ data: invitation });
      try {
        logIn();
        renderApp("/competitions/3/invitation");
        const user = userEvent.setup();
        const cancelled = await screen.findByRole("checkbox", { name: "Invite Joe Rex" });
        expect(cancelled).toBeEnabled();
        expect(screen.getByText(/As a staff member you may also invite cancelled applications/)).toBeInTheDocument();
        await user.click(cancelled);
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() =>
          expect(api.put).toHaveBeenCalledWith("/api/competition/3/invitation/", expect.objectContaining({ referees: [10] })),
        );
      } finally {
        restore();
      }
    });

    it("needs a head referee before sending", async () => {
      const restore = withInvitation();
      try {
        logIn();
        renderApp("/competitions/3/invitation");
        const user = userEvent.setup();
        await user.click(await screen.findByRole("checkbox", { name: "Invite Jane Roe" }));
        expect(screen.getByRole("button", { name: "Send invitation" })).toBeDisabled();
      } finally {
        restore();
      }
    });

    it("refuses the invitation to others", async () => {
      const getOther = (getRequest as Mock).getMockImplementation()!;
      (getRequest as Mock).mockImplementation(async (url: string, signal: AbortSignal) => {
        if (url === "/api/competition/3/invitation/") {
          throw Object.assign(new Error("Forbidden"), { isAxiosError: true, response: { status: 403 } });
        }
        return getOther(url, signal);
      });
      logIn();
      renderApp("/competitions/3/invitation");
      expect(await screen.findByText("Only the invitor of this competition may invite referees.")).toBeInTheDocument();
    });
  });

  it("hides the edit link from others", async () => {
    logIn();
    renderApp("/events/1");
    expect(await screen.findByRole("heading", { name: "Swiss Open" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("edits an event and stays on the edit page", async () => {
    const saved = { id: 1, name: "Swiss Open 2", info: "", location: 1, competitions: [{ ...competition, info: "Masters" }] };
    (api.put as Mock).mockResolvedValue({ data: saved });
    logIn();
    renderApp("/events/1/edit");
    const user = userEvent.setup();

    const name = await screen.findByLabelText(/^Name/);
    expect(name).toHaveValue("Swiss Open");
    expect(screen.getByLabelText("Venue")).toHaveValue("1");
    const day1 = within(screen.getByRole("region", { name: "Day 1" }));
    expect(day1.getByLabelText(/^Date/)).toHaveValue("2030-12-01");
    expect(day1.getByLabelText(/^End/)).toHaveValue("17:00");
    expect(day1.getByLabelText(/^Categories/)).toHaveTextContent("National");
    expect(day1.getByLabelText("Referees needed")).toHaveValue(12);

    await user.clear(name);
    await user.type(name, "Swiss Open 2");
    await user.click(screen.getByRole("button", { name: "Save and continue editing" }));

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const [url, payload] = (api.put as Mock).mock.calls[0];
    expect(url).toBe("/api/events/1/edit/");
    expect(payload).toMatchObject({ name: "Swiss Open 2", location: 1 });
    expect(payload.competitions).toEqual([expect.objectContaining({ id: 3, start: "2030-12-01T09:00", duration: "08:00:00" })]);
    expect(await screen.findByDisplayValue("Masters")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/events/1/edit");
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/events/1");
  });

  it("shows the applications and adds one for any referee", async () => {
    (api.post as Mock).mockResolvedValue({ data: {} });
    logIn();
    renderApp("/events/1/edit");
    const user = userEvent.setup();

    const section = within(await screen.findByRole("region", { name: /^Applications/ }));
    expect(section.getByRole("cell", { name: "Jane Roe" })).toBeInTheDocument();
    expect(section.getByRole("cell", { name: "Applied" })).toBeInTheDocument();
    const select = section.getByLabelText("Add an application");
    // Jane Roe has applied already.
    expect(within(select).queryByRole("option", { name: "Jane Roe" })).not.toBeInTheDocument();
    await user.selectOptions(select, "John Doe");
    await user.click(section.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/events/1/applications/", { user: 7, competition: 3 }),
    );
    expect(await screen.findByText("John Doe was added.")).toBeInTheDocument();
  });

  it("lets admins cancel or decline but not delete an application", async () => {
    (api.patch as Mock).mockResolvedValue({ data: {} });
    logIn();
    renderApp("/events/1/edit");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Remove the application of Jane Roe" }));
    expect(screen.getByRole("button", { name: "Set to cancelled" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete from the database" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Set to declined" }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/events/1/applications/9/", { status: -3 }));
    expect(await screen.findByText("The application of Jane Roe was declined.")).toBeInTheDocument();
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("lets staff delete an application after confirming", async () => {
    (api.delete as Mock).mockResolvedValue({ data: null });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const getStaff = (getRequest as Mock).getMockImplementation()!;
    (getRequest as Mock).mockImplementation(async (url: string, signal: AbortSignal) =>
      url === "/api/user/7" ? { ...(responses[url] as object), is_staff: true } : getStaff(url, signal),
    );
    logIn();
    renderApp("/events/1/edit");
    const user = userEvent.setup();
    const toggle = await screen.findByRole("button", { name: "Remove the application of Jane Roe" });

    await user.click(toggle);
    await user.click(await screen.findByRole("button", { name: "Delete from the database" }));
    expect(api.delete).not.toHaveBeenCalled();

    await user.click(toggle);
    await user.click(await screen.findByRole("button", { name: "Delete from the database" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/api/events/1/applications/9/"));
    expect(await screen.findByText("The application of Jane Roe was deleted.")).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
  });

  it("refuses the edit page without the permission", async () => {
    const getEdit = (getRequest as Mock).getMockImplementation()!;
    (getRequest as Mock).mockImplementation(async (url: string, signal: AbortSignal) => {
      if (url === "/api/events/1/edit/") {
        throw Object.assign(new Error("Forbidden"), { isAxiosError: true, response: { status: 403 } });
      }
      return getEdit(url, signal);
    });
    logIn();
    renderApp("/events/1/edit");
    expect(await screen.findByText(/don't have the permission to edit this event/)).toBeInTheDocument();
  });

  it("highlights missing fields instead of submitting", async () => {
    logIn();
    renderApp("/events/new");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add competition day" }));
    expect(screen.getByRole("region", { name: "Day 2" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Day 2" }));
    expect(screen.queryByRole("region", { name: "Day 2" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));

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

    await user.click(screen.getByRole("button", { name: "Save" }));

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

  it("shows the invitation of invited applications in a read-only window", async () => {
    const previous = { ...responses };
    const application = { id: 20, user: 7, created: "2030-10-01T10:00", modified: "2030-10-01T10:00", status: 2 };
    responses["/api/applications/"] = [
      { ...application, competition: 3, has_invitation: true },
      { ...application, id: 21, competition: 4, status: 0, has_invitation: false },
    ];
    responses["/api/competition/3"] = { id: 3, event: { ...events[0] }, start: "2030-12-01T09:00", info: "Seniors" };
    responses["/api/competition/4"] = { id: 4, event: { ...events[1] }, start: "2030-11-01T09:00", info: "Juniors" };
    responses["/api/applications/20/invitation/"] = {
      subject: "Invitation Swiss Open", message: "Line one\nLine two", sent: "2030-11-01T10:00:00+01:00",
      sender: "Ina Vitor", is_update: true, event_name: "Swiss Open", location: "Dojo Bern",
      address: "Main Street 1, 3000 Bern", start: "2030-12-01T09:00", end: "2030-12-01T17:00", info: "Seniors",
      referees: [{ name: "Ben Bein", head: true }, { name: "John Doe", head: false }],
    };
    try {
      logIn();
      renderApp("/profile");
      const user = userEvent.setup();
      // Only the invited application has the eye.
      const [eye, ...others] = await screen.findAllByRole("button", { name: "Show the invitation" });
      expect(others).toHaveLength(0);
      expect(getRequest).not.toHaveBeenCalledWith("/api/applications/20/invitation/", expect.anything());

      await user.click(eye);
      const dialog = within(await screen.findByRole("dialog"));
      expect(await dialog.findByText("Invitation Swiss Open")).toBeInTheDocument();
      expect(dialog.getByText(/by Ina Vitor/)).toBeInTheDocument();
      expect(dialog.getByText(/This is an update/)).toBeInTheDocument();
      expect(dialog.getByText(/Line one/)).toBeInTheDocument();
      expect(dialog.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Ben Bein (head referee)", "John Doe"]);
      // Read only.
      expect(dialog.queryByRole("textbox")).not.toBeInTheDocument();

      await user.click(dialog.getAllByRole("button", { name: "Close" })[0]);
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    } finally {
      Object.keys(responses).forEach((key) => delete responses[key]);
      Object.assign(responses, previous);
    }
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
