import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
    activateTOTP,
    changePassword,
    deleteWebAuthn,
    getAuthenticators,
    getRecoveryCodes,
    getTOTP,
    reauthenticate,
    renameWebAuthn,
} from "../../../lib/allauth";
import SecuritySettings from "./SecuritySettings";

vi.mock("../../../lib/allauth", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../../lib/allauth")>();
    const mocked = Object.fromEntries(
        Object.entries(actual).map(([name, value]) =>
            // Keep the helpers that read responses, mock every call.
            [name, ["pendingFlow", "needsReauthentication", "isLoggedIn", "errorMessage"].includes(name) ? value : vi.fn()],
        ),
    );
    return mocked;
});

const key = {
    id: 3, type: "webauthn", name: "Laptop", is_passwordless: true, created_at: 1735689600, last_used_at: null,
};
const recovery = {
    type: "recovery_codes", created_at: 1735689600, last_used_at: null, total_code_count: 10, unused_code_count: 9,
};
const reauthRequired = {
    status: 401,
    data: { flows: [{ id: "reauthenticate" }, { id: "mfa_reauthenticate", types: ["webauthn"] }] },
    meta: { is_authenticated: true },
};

beforeEach(() => {
    (getAuthenticators as Mock).mockResolvedValue({ status: 200, data: [key, recovery] });
    vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("SecuritySettings", () => {
    it("lists the keys and warns about a single factor", async () => {
        render(<SecuritySettings />);
        expect(await screen.findByText("Laptop")).toBeInTheDocument();
        expect(screen.getByText("Passkey")).toBeInTheDocument();
        expect(screen.getByText(/You have one second factor/)).toBeInTheDocument();
        expect(screen.getByText(/9 of 10 are unused/)).toBeInTheDocument();
    });

    it("sets up the authenticator app after confirming the password", async () => {
        (getTOTP as Mock).mockResolvedValue({
            status: 404, meta: { secret: "JBSWY3DPEHPK3PXP", totp_url: "otpauth://totp/Referee%20System:john?secret=JBSWY3DPEHPK3PXP" },
        });
        (activateTOTP as Mock)
            .mockResolvedValueOnce(reauthRequired)
            .mockResolvedValueOnce({ status: 200, data: { type: "totp" } });
        (reauthenticate as Mock).mockResolvedValue({ status: 200 });
        const user = userEvent.setup();
        render(<SecuritySettings />);

        await user.click(await screen.findByRole("button", { name: "Set up" }));
        expect(screen.getByTitle("QR code for the authenticator app")).toBeInTheDocument();
        expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
        await user.type(screen.getByLabelText("Code"), "123456");
        await user.click(screen.getByRole("button", { name: "Activate" }));

        const dialog = await screen.findByRole("dialog");
        await user.type(within(dialog).getByLabelText("Password"), "s3cret");
        await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

        // Once activated, the list is loaded again.
        await waitFor(() => expect(getAuthenticators).toHaveBeenCalledTimes(2));
        expect(reauthenticate).toHaveBeenCalledWith("s3cret");
        expect(activateTOTP).toHaveBeenCalledTimes(2);
        expect(activateTOTP).toHaveBeenLastCalledWith("123456");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("does not repeat the change when the confirmation is cancelled", async () => {
        (getRecoveryCodes as Mock).mockResolvedValue(reauthRequired);
        const user = userEvent.setup();
        render(<SecuritySettings />);

        await user.click(await screen.findByRole("button", { name: "Show codes" }));
        await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Close" }));
        expect(getRecoveryCodes).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("list", { name: "Recovery codes" })).not.toBeInTheDocument();
    });

    it("renames and removes a key", async () => {
        (renameWebAuthn as Mock).mockResolvedValue({ status: 200 });
        (deleteWebAuthn as Mock).mockResolvedValue({ status: 200 });
        const user = userEvent.setup();
        render(<SecuritySettings />);

        await user.click(await screen.findByRole("button", { name: "Rename" }));
        const name = screen.getByLabelText("Name");
        await user.clear(name);
        await user.type(name, "Phone");
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(renameWebAuthn).toHaveBeenCalledWith(3, "Phone");

        await user.click(await screen.findByRole("button", { name: "Remove" }));
        expect(deleteWebAuthn).toHaveBeenCalledWith([3]);
    });

    it("changes the password", async () => {
        (changePassword as Mock).mockResolvedValue({ status: 200, meta: { access_token: "new" } });
        const user = userEvent.setup();
        render(<SecuritySettings />);

        await user.type(await screen.findByLabelText("Current password"), "old-Pa55word");
        await user.type(screen.getByLabelText("New password"), "N3w-Pa55word!x");
        await user.type(screen.getByLabelText("Repeat the new password"), "N3w-Pa55word!x");
        await user.click(screen.getByRole("button", { name: "Change password" }));

        expect(changePassword).toHaveBeenCalledWith("old-Pa55word", "N3w-Pa55word!x");
        await waitFor(() => expect(screen.getByLabelText("Current password")).toHaveValue(""));
        expect(screen.getByLabelText("New password")).toHaveValue("");
    });

    it("does not send new passwords that do not match", async () => {
        const user = userEvent.setup();
        render(<SecuritySettings />);

        await user.type(await screen.findByLabelText("Current password"), "old-Pa55word");
        await user.type(screen.getByLabelText("New password"), "N3w-Pa55word!x");
        await user.type(screen.getByLabelText("Repeat the new password"), "N3w-Pa55word!y");
        await user.click(screen.getByRole("button", { name: "Change password" }));

        expect(screen.getByText("The new passwords do not match.")).toBeInTheDocument();
        expect(changePassword).not.toHaveBeenCalled();
    });

    it("shows the errors of the server by field", async () => {
        (changePassword as Mock).mockResolvedValue({
            status: 400,
            errors: [
                { code: "enter_current_password", param: "current_password", message: "Please type your current password." },
            ],
        });
        const user = userEvent.setup();
        render(<SecuritySettings />);

        await user.type(await screen.findByLabelText("Current password"), "wrong");
        await user.type(screen.getByLabelText("New password"), "N3w-Pa55word!x");
        await user.type(screen.getByLabelText("Repeat the new password"), "N3w-Pa55word!x");
        await user.click(screen.getByRole("button", { name: "Change password" }));

        expect(await screen.findByText("Please type your current password.")).toBeInTheDocument();
        expect(screen.getByLabelText("Current password")).toHaveClass("is-invalid");
        // The form keeps what was typed, to correct it.
        expect(screen.getByLabelText("New password")).toHaveValue("N3w-Pa55word!x");
    });
});
