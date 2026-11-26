import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import api, { getRequest } from "../../../lib/api";
import ProfilePage from "./ProfilePage";

vi.mock("../../../lib/api", () => {
  const api = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  return { default: api, api, getRequest: vi.fn() };
});

const profile = {
  id: 9, username: "nina", first_name: "Nina", last_name: "Newbie", email: "nina@example.com",
  is_staff: false, permissions: [], account: { onboarded: true, email_confirmed: true, approval_notifications: "never" },
  referee: {
    address: 12, phone: "031 000 00 00", mobile: "", dob: "1990-04-01", iban: "CH00 0000 0000 0000 0000 0",
    share_email: true, share_phone: false, share_mobile: false, share_dob: false, share_address: false,
  },
};
const home = { id: 12, street: "Main Street", house_number: "4", area_code: "3000", city: "Bern", country: "Switzerland" };

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
    "/api/user/9": profile,
    "/api/address/12/": home,
    "/api/examinations/user/": [],
    "/api/applications/": page([]),
    "api/licenses/": [],
  };
  (getRequest as Mock).mockImplementation(async (url: string) => {
    if (!(url in responses)) throw new Error(`Unexpected request ${url}`);
    return responses[url];
  });
  (api.patch as Mock).mockResolvedValue({ data: {} });
  (api.post as Mock).mockResolvedValue({ data: {} });
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ProfilePage pk={9} /><ToastContainer /></MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The card of a section, found by its edit button. */
async function section(title: string) {
  const pen = await screen.findByRole("button", { name: `Edit ${title.toLowerCase()}` });
  return within(pen.closest(".card") as HTMLElement);
}

describe("ProfilePage", () => {
  it("shows the whole profile", async () => {
    renderPage();
    expect(await screen.findByText("nina@example.com")).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("1990-04-01")).toBeInTheDocument();
    expect(screen.getByText("031 000 00 00")).toBeInTheDocument();
    expect(screen.getByText(/Main Street 4/)).toBeInTheDocument();
    expect(screen.getByText("CH00 0000 0000 0000 0000 0")).toBeInTheDocument();
    const sharing = await section("Visible to other users");
    expect(sharing.getAllByText("Yes")).toHaveLength(1);
    expect(sharing.getAllByText("No")).toHaveLength(4);
  });

  it("starts with the sections collapsed and opens them", async () => {
    const user = userEvent.setup();
    renderPage();
    const toggle = await screen.findByRole("button", { name: "Bank details" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Personal details" })).toHaveAttribute("aria-expanded", "true");
    for (const title of ["Contact", "Address", "Visible to other users", "Examinations"]) {
      expect(screen.getByRole("button", { name: title })).toHaveAttribute("aria-expanded", "false");
    }
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    // The pen opens a collapsed section to edit it.
    const contact = screen.getByRole("button", { name: "Contact" });
    await user.click(screen.getByRole("button", { name: "Edit contact" }));
    expect(contact).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Phone number")).toBeInTheDocument();
  });

  it("edits one section at a time", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit contact" }));
    await user.click(screen.getByRole("button", { name: "Edit bank details" }));

    expect(await screen.findByText(
      'Please save or cancel your changes to "Contact" before editing "Bank details".',
    )).toBeInTheDocument();
    expect(screen.queryByLabelText("IBAN")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bank details" })).toHaveAttribute("aria-expanded", "false");

    // Once the contact is saved, the bank details may be edited.
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.click(await screen.findByRole("button", { name: "Edit bank details" }));
    expect(await screen.findByLabelText("IBAN")).toBeInTheDocument();
  });

  it("shows the notifications only to those who may approve accounts", async () => {
    // Staff status alone doesn't count.
    responses["/api/user/9"] = { ...profile, is_staff: true };
    renderPage();
    expect(await screen.findByRole("button", { name: "Personal details" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notifications" })).not.toBeInTheDocument();
  });

  it("saves the e-mail setting of approvers", async () => {
    responses["/api/user/9"] = { ...profile, permissions: ["accounts.approve_account"] };
    const user = userEvent.setup();
    renderPage();
    const notifications = await section("Notifications");
    expect(notifications.getByText("Never")).toBeInTheDocument();
    await user.click(notifications.getByRole("button", { name: "Edit notifications" }));
    await user.selectOptions(notifications.getByLabelText("E-mail me when accounts await approval"), "Daily digest");
    await user.click(notifications.getByRole("button", { name: "Save" }));

    expect(api.patch).toHaveBeenCalledWith("/api/user/9/", { account: { approval_notifications: "daily" } });
  });

  it("edits the phone numbers", async () => {
    const user = userEvent.setup();
    renderPage();
    const contact = await section("Contact");
    await user.click(contact.getByRole("button", { name: "Edit contact" }));
    expect(contact.getByLabelText("Phone number")).toHaveValue("031 000 00 00");
    await user.type(contact.getByLabelText("Mobile phone number"), "079 000 00 00");
    await user.click(contact.getByRole("button", { name: "Save" }));

    expect(api.patch).toHaveBeenCalledWith("/api/user/9/", {
      email: "nina@example.com", referee: { phone: "031 000 00 00", mobile: "079 000 00 00" },
    });
    expect(await contact.findByRole("button", { name: "Edit contact" })).toBeInTheDocument();
    expect(contact.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("requires the name", async () => {
    const user = userEvent.setup();
    renderPage();
    const personal = await section("Personal details");
    await user.click(personal.getByRole("button", { name: "Edit personal details" }));
    await user.clear(personal.getByLabelText(/First name/));
    await user.click(personal.getByRole("button", { name: "Save" }));

    expect(await personal.findByText("This field is required.")).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("shows the errors of the server", async () => {
    (api.patch as Mock).mockRejectedValue(Object.assign(new Error("Bad request"), {
      isAxiosError: true, response: { status: 400, data: { referee: { iban: ["Enter a valid IBAN."] } } },
    }));
    const user = userEvent.setup();
    renderPage();
    const bank = await section("Bank details");
    await user.click(bank.getByRole("button", { name: "Edit bank details" }));
    await user.click(bank.getByRole("button", { name: "Save" }));

    expect(await bank.findByText("Enter a valid IBAN.")).toBeInTheDocument();
    expect(bank.getByLabelText("IBAN")).toHaveClass("is-invalid");
  });

  it("changes what other users may see", async () => {
    const user = userEvent.setup();
    renderPage();
    const sharing = await section("Visible to other users");
    await user.click(sharing.getByRole("button", { name: "Edit visible to other users" }));
    await user.click(sharing.getByLabelText("My e-mail address"));
    await user.click(sharing.getByLabelText("My address"));
    await user.click(sharing.getByRole("button", { name: "Save" }));

    expect(api.patch).toHaveBeenCalledWith("/api/user/9/", {
      referee: { share_email: false, share_phone: false, share_mobile: false, share_dob: false, share_address: true },
    });
  });

  it("discards changes on cancel", async () => {
    const user = userEvent.setup();
    renderPage();
    const bank = await section("Bank details");
    await user.click(bank.getByRole("button", { name: "Edit bank details" }));
    await user.clear(bank.getByLabelText("IBAN"));
    await user.click(bank.getByRole("button", { name: "Cancel" }));

    expect(bank.getByText("CH00 0000 0000 0000 0000 0")).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("updates the address", async () => {
    const user = userEvent.setup();
    renderPage();
    const address = await section("Address");
    await user.click(address.getByRole("button", { name: "Edit address" }));
    expect(address.getByLabelText("Street")).toHaveValue("Main Street");
    await user.clear(address.getByLabelText("City"));
    await user.click(address.getByRole("button", { name: "Save" }));
    expect(await address.findByText("This field is required.")).toBeInTheDocument();

    await user.type(address.getByLabelText("City"), "Biel");
    await user.click(address.getByRole("button", { name: "Save" }));
    expect(api.patch).toHaveBeenCalledWith("/api/address/12/", {
      street: "Main Street", house_number: "4", area_code: "3000", city: "Biel", country: "Switzerland",
    });
  });

  it("removes the address once all its fields are emptied", async () => {
    const user = userEvent.setup();
    renderPage();
    const address = await section("Address");
    await user.click(address.getByRole("button", { name: "Edit address" }));
    for (const field of ["Street", "House number", "Postal code", "City", "Country"]) {
      await user.clear(address.getByLabelText(field));
    }
    await user.click(address.getByRole("button", { name: "Save" }));
    expect(api.patch).toHaveBeenCalledWith("/api/user/9/", { referee: { address: null } });
  });

  it("creates an address for users without one", async () => {
    responses["/api/user/9"] = { ...profile, referee: { ...profile.referee, address: null } };
    const user = userEvent.setup();
    renderPage();
    const address = await section("Address");
    expect(address.getByText("Not given")).toBeInTheDocument();
    await user.click(address.getByRole("button", { name: "Edit address" }));
    await user.type(address.getByLabelText("Street"), "Lake Road");
    await user.type(address.getByLabelText("City"), "Thun");
    await user.click(address.getByRole("button", { name: "Save" }));

    expect(api.post).toHaveBeenCalledWith("/api/address/", {
      street: "Lake Road", house_number: "", area_code: "", city: "Thun", country: "", personal: true,
    });
  });

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
