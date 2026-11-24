import { describe, expect, it } from "vitest";
import { addCopyEmail, chooseHeadReferee, InvitationForm, invitationPayload, invitedReferees, toggleReferee } from "./Invitation";

const form: InvitationForm = {
    referees: [1, 2], headReferee: null, subject: " Invitation ", message: "Hi", copyUsers: [], copyEmails: [],
};

describe("invitation form", () => {
    it("selects and deselects referees", () => {
        expect(toggleReferee(form, 3).referees).toEqual([1, 2, 3]);
        expect(toggleReferee(form, 1).referees).toEqual([2]);
    });

    it("clears the head referee when deselecting them", () => {
        const withHead = { ...form, headReferee: 2 };
        expect(toggleReferee(withHead, 2)).toMatchObject({ referees: [1], headReferee: null });
        expect(toggleReferee(withHead, 1).headReferee).toBe(2);
    });

    it("invites the head referee", () => {
        expect(chooseHeadReferee(form, 5)).toMatchObject({ referees: [1, 2, 5], headReferee: 5 });
        expect(chooseHeadReferee(form, 1)).toMatchObject({ referees: [1, 2], headReferee: 1 });
    });

    it("sends the head referee among the referees and trims the subject", () => {
        expect(invitationPayload({ ...form, referees: [1, 1], headReferee: 4 })).toEqual({
            referees: [4, 1],
            head_referee: 4,
            subject: "Invitation",
            message: "Hi",
            copy_users: [],
            copy_emails: [],
        });
    });

    it("lists the head referee first, then by name", () => {
        const names = new Map([[1, "Zoe"], [2, "Anna"], [3, "Mia"]]);
        expect(invitedReferees({ ...form, referees: [1, 2, 3], headReferee: 3 }, names)).toEqual([
            { id: 3, name: "Mia", head: true },
            { id: 2, name: "Anna", head: false },
            { id: 1, name: "Zoe", head: false },
        ]);
    });

    it("adds valid e-mail addresses once", () => {
        const added = addCopyEmail(form, " office@example.ch ");
        expect(added).toMatchObject({ copyEmails: ["office@example.ch"] });
        expect(addCopyEmail(added as InvitationForm, "Office@Example.ch")).toBe("This address was already added.");
        expect(addCopyEmail(form, "office@example")).toBe("Enter a valid e-mail address.");
    });
});
