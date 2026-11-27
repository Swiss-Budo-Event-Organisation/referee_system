import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import api, { getRequest } from "../../../lib/api";
import { logInAs } from "../../../test/utils";
import ConfirmEmail from "./ConfirmEmail";
import OnboardingForm from "./OnboardingForm";
import PendingAccounts from "./PendingAccounts";
import RegisterForm from "./RegisterForm";

vi.mock("../../../lib/api", () => {
  const api = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
  return { default: api, api, getRequest: vi.fn() };
});

const staff = {
  id: 7, username: "admin", first_name: "Ada", last_name: "Admin", email: "ada@example.com",
  is_staff: true, permissions: ["accounts.approve_account"], account: { onboarded: true, email_confirmed: true, approval_notifications: "never" },
  referee: {},
};
const newcomer = {
  id: 9, username: "nina", first_name: "Nina", last_name: "Newbie", email: "nina@example.com",
  is_staff: false, permissions: [], account: { onboarded: false, email_confirmed: true, approval_notifications: "never" },
  referee: { phone: "", mobile: "", dob: null, iban: "", share_email: false, share_phone: false, share_mobile: false, share_dob: false, share_address: false },
};
const pending = [{
  id: 21, username: "paul", first_name: "Paul", last_name: "Pending", email: "paul@example.com",
  date_joined: "2026-11-20T10:00:00Z", expires: "2026-12-20T10:00:00Z",
}];

let responses: Record<string, unknown>;

function renderWith(ui: ReactNode, path = "/") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="*" element={ui} />
          <Route path="/events" element={<h1>Events page</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function axiosError(data: object) {
  return Object.assign(new Error("Bad request"), { isAxiosError: true, response: { status: 400, data } });
}

beforeEach(() => {
  responses = {
    "/api/user/7": staff,
    "/api/user/9": newcomer,
    "/api/accounts/pending/": pending,
    "/api/accounts/groups/": [{ id: 1, name: "Region 1" }, { id: 2, name: "Region 1 Admin" }],
    "api/licenses/": [{ id: 3, name: "Regional" }, { id: 4, name: "National" }],
  };
  (getRequest as Mock).mockImplementation(async (url: string) => {
    if (!(url in responses)) throw new Error(`Unexpected request ${url}`);
    return responses[url];
  });
});

async function fillRegistration(user: ReturnType<typeof userEvent.setup>, repeat = "s3cret-Pa55word") {
  await user.type(screen.getByLabelText(/First name/), "Nina");
  await user.type(screen.getByLabelText(/Last name/), "Newbie");
  await user.type(screen.getByLabelText(/Username/), "nina");
  await user.type(screen.getByLabelText(/E-mail address/), "nina@example.com");
  await user.type(screen.getByLabelText(/^Password/), "s3cret-Pa55word");
  await user.type(screen.getByLabelText(/Repeat the password/), repeat);
}

describe("RegisterForm", () => {
  it("registers and says the account awaits approval", async () => {
    (api.post as Mock).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderWith(<RegisterForm />);
    await fillRegistration(user);
    await user.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByText("Your registration is awaiting approval")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/api/user/register/", {
      first_name: "Nina", last_name: "Newbie", username: "nina", email: "nina@example.com",
      password: "s3cret-Pa55word", password_repeat: "s3cret-Pa55word",
    });
  });

  it("checks that the passwords match", async () => {
    const user = userEvent.setup();
    renderWith(<RegisterForm />);
    await fillRegistration(user, "different");
    await user.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByText("The passwords do not match.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("shows the errors of the server by field", async () => {
    (api.post as Mock).mockRejectedValue(axiosError({ email: ["This e-mail address is already in use."] }));
    const user = userEvent.setup();
    renderWith(<RegisterForm />);
    await fillRegistration(user);
    await user.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByText("This e-mail address is already in use.")).toBeInTheDocument();
    expect(screen.getByLabelText(/E-mail address/)).toHaveClass("is-invalid");
  });
});

describe("OnboardingForm", () => {
  it("requires the name and saves the rest as optional", async () => {
    (api.patch as Mock).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderWith(<OnboardingForm pk={9} />, "/onboarding");

    const first = await screen.findByLabelText(/First name/);
    expect(first).toHaveValue("Nina");
    await user.clear(first);
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText("This field is required.")).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();

    await user.type(first, "Nina");
    await user.type(screen.getByLabelText("Mobile phone number"), "079 000 00 00");
    await user.click(screen.getByLabelText("My mobile phone number"));
    await user.click(screen.getByRole("button", { name: "Save and continue" }));

    expect(await screen.findByRole("heading", { name: "Events page" })).toBeInTheDocument();
    expect(api.patch).toHaveBeenCalledWith("/api/user/9/", {
      first_name: "Nina",
      last_name: "Newbie",
      account: { onboarded: true },
      referee: {
        phone: "", mobile: "079 000 00 00", dob: null, iban: "",
        share_email: false, share_phone: false, share_mobile: true, share_dob: false, share_address: false,
      },
    });
    // No address given, so none is created.
    expect(api.post).not.toHaveBeenCalled();
  });

  it("creates the personal address", async () => {
    (api.post as Mock).mockResolvedValue({ data: { id: 30 } });
    (api.patch as Mock).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderWith(<OnboardingForm pk={9} />, "/onboarding");

    await user.type(await screen.findByLabelText("Street"), "Main Street");
    await user.type(screen.getByLabelText("House number"), "4");
    await user.type(screen.getByLabelText("Postal code"), "3000");
    await user.type(screen.getByLabelText("City"), "Bern");
    await user.click(screen.getByLabelText("My address"));
    await user.click(screen.getByRole("button", { name: "Save and continue" }));

    expect(await screen.findByRole("heading", { name: "Events page" })).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/api/address/", {
      street: "Main Street", house_number: "4", area_code: "3000", city: "Bern", country: "", personal: true,
    });
    expect(api.patch).toHaveBeenCalledWith("/api/user/9/", expect.objectContaining({
      referee: expect.objectContaining({ share_address: true }),
    }));
  });

  it("needs street and city once an address is begun", async () => {
    const user = userEvent.setup();
    renderWith(<OnboardingForm pk={9} />, "/onboarding");

    await user.type(await screen.findByLabelText("Postal code"), "3000");
    await user.click(screen.getByRole("button", { name: "Save and continue" }));

    expect(await screen.findAllByText("This field is required.")).toHaveLength(2);
    expect(screen.getByLabelText("Street")).toHaveClass("is-invalid");
    expect(screen.getByLabelText("City")).toHaveClass("is-invalid");
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("updates an address the user already has", async () => {
    responses["/api/user/9"] = { ...newcomer, referee: { ...newcomer.referee, address: 12 } };
    responses["/api/address/12/"] = {
      id: 12, street: "Old Street", house_number: "1", area_code: "3600", city: "Thun", country: "Switzerland",
    };
    (api.patch as Mock).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderWith(<OnboardingForm pk={9} />, "/onboarding");

    const street = await screen.findByLabelText("Street");
    expect(street).toHaveValue("Old Street");
    await user.clear(street);
    await user.type(street, "New Street");
    await user.click(screen.getByRole("button", { name: "Save and continue" }));

    expect(await screen.findByRole("heading", { name: "Events page" })).toBeInTheDocument();
    expect(api.patch).toHaveBeenCalledWith("/api/address/12/", {
      street: "New Street", house_number: "1", area_code: "3600", city: "Thun", country: "Switzerland",
    });
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe("PendingAccounts", () => {
  beforeEach(() => logInAs(7));

  it("refuses users without the permission, staff or not", async () => {
    responses["/api/user/7"] = { ...staff, permissions: [] };
    renderWith(<PendingAccounts />);
    expect(await screen.findByText("You may not see the accounts awaiting approval.")).toBeInTheDocument();
  });

  it("only shows the accounts to those who may view but not approve them", async () => {
    logInAs(9);
    responses["/api/user/9"] = { ...newcomer, permissions: ["accounts.view_account"] };
    renderWith(<PendingAccounts />);
    const row = (await screen.findByText("Paul Pending")).closest("tr") as HTMLElement;
    expect(within(row).queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("approves an account with a group and an examination", async () => {
    (api.post as Mock).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderWith(<PendingAccounts />);

    const row = (await screen.findByText("Paul Pending")).closest("tr") as HTMLElement;
    expect(within(row).getByText("paul@example.com")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Approve" }));

    const dialog = await screen.findByRole("dialog", { name: "Approve Paul Pending" });
    await user.click(await within(dialog).findByRole("button", { name: "Groups" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Region 1" }));
    await user.click(within(dialog).getByRole("button", { name: "Add examination" }));
    const approve = within(dialog).getByRole("button", { name: "Approve" });
    expect(approve).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText("License"), "Regional");
    await user.type(within(dialog).getByLabelText("Date"), "2020-05-01");
    await user.click(approve);

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/accounts/pending/21/approve/", {
      groups: [1],
      examinations: [{ license: 3, date: "2020-05-01" }],
    }));
  });

  it("deletes a registration after asking", async () => {
    (api.delete as Mock).mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    renderWith(<PendingAccounts />);

    const row = (await screen.findByText("Paul Pending")).closest("tr") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete the registration?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/api/accounts/pending/21/"));
  });
});

describe("ConfirmEmail", () => {
  it("confirms the address", async () => {
    (api.post as Mock).mockResolvedValue({ data: {} });
    renderWith(<ConfirmEmail token="abc" loggedIn={false} />);

    expect(await screen.findByText("Your e-mail address is confirmed.")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/api/accounts/confirm-email/", { token: "abc" });
    expect(screen.getByRole("link", { name: "Log in to complete your profile" })).toHaveAttribute("href", "/login");
  });

  it("explains an expired link", async () => {
    (api.post as Mock).mockRejectedValue(axiosError({ detail: "This link is invalid or has expired." }));
    renderWith(<ConfirmEmail token="old" loggedIn />);

    expect(await screen.findByText(/This link is invalid or has expired./)).toBeInTheDocument();
  });
});
