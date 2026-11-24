from django.core import mail
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from api.tests.helpers import make_competition
from api.tests.helpers import make_event
from api.tests.helpers import make_user
from competition.models import Application
from competition.models import Invitation

Status = Application.Status


def referee(username, first_name, last_name, email=True):
    user = make_user(
        username,
        first_name=first_name,
        last_name=last_name,
        email=f"{username}@example.ch" if email else "",
    )
    return user.referee


class InvitationTestCase(APITestCase):
    def setUp(self):
        self.invitor = make_user("invitor", email="invitor@example.ch")
        self.event = make_event("Swiss Open")
        self.competition = make_competition(self.event, self.invitor.referee)
        self.anna = referee("anna", "Anna", "Arm")
        self.ben = referee("ben", "Ben", "Bein")
        self.cleo = referee("cleo", "Cleo", "Clinch")
        self.dan = referee("dan", "Dan", "Dojo", email=False)
        self.applied = {
            r.pk: Application.objects.create(user=r, competition=self.competition)
            for r in (self.anna, self.ben, self.cleo)
        }
        self.client.force_authenticate(self.invitor)

    def url(self, send=False):
        name = "competition-invitation-send" if send else "competition-invitation"
        return reverse(name, args=[self.competition.pk])

    def data(self, referees, head_referee=None, **kwargs):
        return {
            "referees": [r.pk for r in referees],
            "head_referee": head_referee.pk if head_referee else None,
            "subject": "Invitation Swiss Open",
            "message": "See you on the mat.",
            **kwargs,
        }

    def save(self, *referees, head_referee=None, **kwargs):
        return self.client.put(
            self.url(), self.data(referees, head_referee, **kwargs), format="json"
        )

    def send(self, *referees, head_referee=None, **kwargs):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(
                self.url(send=True),
                self.data(referees, head_referee, **kwargs),
                format="json",
            )

    def status_of(self, referee):
        return Application.objects.get(
            user=referee, competition=self.competition
        ).status


class TestInvitationAccess(InvitationTestCase):
    def test_invitor_may_load_the_invitation(self):
        response = self.client.get(self.url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["invitation"]["id"], None)
        self.assertIn("Swiss Open", response.data["invitation"]["subject"])
        self.assertEqual(len(response.data["applications"]), 3)

    def test_others_may_not(self):
        self.client.force_authenticate(self.anna.user)
        for response in (
            self.client.get(self.url()),
            self.save(self.anna),
            self.send(self.anna, head_referee=self.anna),
        ):
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Invitation.objects.exists())

    def test_staff_may(self):
        self.client.force_authenticate(make_user("staff", is_staff=True))
        self.assertEqual(self.client.get(self.url()).status_code, status.HTTP_200_OK)

    def test_event_shows_who_may_invite(self):
        response = self.client.get(reverse("event-detail", args=[self.event.pk]))
        self.assertTrue(response.data["competitions"][0]["can_invite"])
        self.client.force_authenticate(self.anna.user)
        response = self.client.get(reverse("event-detail", args=[self.event.pk]))
        self.assertFalse(response.data["competitions"][0]["can_invite"])


class TestSaveInvitation(InvitationTestCase):
    def test_marks_selected_and_not_selected(self):
        response = self.save(self.anna, self.ben, head_referee=self.anna)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(self.status_of(self.anna), Status.SELECTED)
        self.assertEqual(self.status_of(self.ben), Status.SELECTED)
        self.assertEqual(self.status_of(self.cleo), Status.NOTSELECTED)
        self.assertEqual(len(mail.outbox), 0)

    def test_adds_referees_who_did_not_apply(self):
        response = self.save(self.anna, self.dan)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(self.status_of(self.dan), Status.SELECTED)
        self.assertCountEqual(
            response.data["invitation"]["referees"], [self.anna.pk, self.dan.pk]
        )

    def test_head_referee_is_invited(self):
        self.save(self.anna, head_referee=self.ben)
        self.assertEqual(self.status_of(self.ben), Status.SELECTED)
        # The competition gets the head referee only once it is sent.
        self.competition.refresh_from_db()
        self.assertIsNone(self.competition.head_referee)

    def test_saving_again_updates_the_draft(self):
        self.save(self.anna, self.ben)
        response = self.save(self.cleo, subject="Changed")
        self.assertEqual(Invitation.objects.count(), 1)
        self.assertEqual(response.data["invitation"]["subject"], "Changed")
        self.assertEqual(self.status_of(self.anna), Status.NOTSELECTED)
        self.assertEqual(self.status_of(self.cleo), Status.SELECTED)

    def test_cancelled_applications_cannot_be_invited(self):
        application = self.applied[self.cleo.pk]
        application.status = Status.CANCELLED
        application.save()
        response = self.save(self.anna, self.cleo)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Cleo Clinch", str(response.data["referees"]))
        self.save(self.anna)
        self.assertEqual(self.status_of(self.cleo), Status.CANCELLED)


class TestSendInvitation(InvitationTestCase):
    def test_marks_invited_and_declined(self):
        response = self.send(self.anna, self.ben, head_referee=self.anna)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(self.status_of(self.anna), Status.INVITED)
        self.assertEqual(self.status_of(self.ben), Status.INVITED)
        self.assertEqual(self.status_of(self.cleo), Status.DECLINED)
        self.assertIsNotNone(response.data["last_sent"]["sent"])

    def test_sets_head_referee_of_the_competition(self):
        self.send(self.anna, self.ben, head_referee=self.ben)
        self.competition.refresh_from_db()
        self.assertEqual(self.competition.head_referee, self.ben)

    def test_mails_list_of_invited_referees_and_head_referee(self):
        self.send(self.anna, self.ben, self.dan, head_referee=self.ben)
        recipients = sorted(m.to[0] for m in mail.outbox)
        # Dan has no e-mail address; the invitor gets a copy.
        self.assertEqual(
            recipients, ["anna@example.ch", "ben@example.ch", "invitor@example.ch"]
        )
        message = next(m for m in mail.outbox if m.to == ["anna@example.ch"])
        self.assertEqual(message.subject, "Invitation Swiss Open")
        self.assertEqual(message.reply_to, ["invitor@example.ch"])
        self.assertIn("See you on the mat.", message.body)
        self.assertIn("Head referee: Ben Bein", message.body)
        self.assertIn("- Ben Bein (head referee)\n- Anna Arm\n- Dan Dojo", message.body)
        self.assertNotIn("Cleo", message.body)
        html = message.alternatives[0].content
        self.assertIn("<strong>Ben Bein</strong> (head referee)", html)

    def test_reports_referees_without_email(self):
        response = self.send(self.anna, self.dan, head_referee=self.anna)
        self.assertEqual(response.data["missing_email"], ["Dan Dojo"])

    def test_needs_referees_and_head_referee(self):
        response = self.send(self.anna)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("head_referee", response.data)
        response = self.send()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("referees", response.data)
        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(self.status_of(self.anna), Status.APPLIED)

    def test_sends_the_saved_draft(self):
        self.save(self.anna)
        self.send(self.anna, self.ben, head_referee=self.anna)
        invitation = Invitation.objects.get()
        self.assertIsNotNone(invitation.sent)
        self.assertEqual(invitation.sender, self.invitor)


class TestUpdateInvitation(InvitationTestCase):
    def setUp(self):
        super().setUp()
        self.send(self.anna, self.ben, head_referee=self.anna)
        mail.outbox.clear()

    def test_loads_sent_invitation_as_starting_point(self):
        data = self.client.get(self.url()).data
        self.assertIsNone(data["invitation"]["id"])
        self.assertCountEqual(
            data["invitation"]["referees"], [self.anna.pk, self.ben.pk]
        )
        self.assertEqual(data["invitation"]["head_referee"], self.anna.pk)

    def test_invited_stay_invited_until_the_update_is_sent(self):
        self.save(self.anna, self.cleo, head_referee=self.anna)
        self.assertEqual(self.status_of(self.ben), Status.INVITED)
        self.assertEqual(self.status_of(self.anna), Status.INVITED)
        self.assertEqual(self.status_of(self.cleo), Status.SELECTED)
        self.assertEqual(len(mail.outbox), 0)

    def test_sending_the_update(self):
        self.send(self.anna, self.cleo, head_referee=self.cleo)
        self.assertEqual(self.status_of(self.ben), Status.DECLINED)
        self.assertEqual(self.status_of(self.cleo), Status.INVITED)
        first, update = Invitation.objects.order_by("created")
        self.assertEqual(update.previous_invitation, first)
        self.assertIn("update of the invitation", mail.outbox[0].body)
        self.competition.refresh_from_db()
        self.assertEqual(self.competition.head_referee, self.cleo)


class TestFurtherRecipients(InvitationTestCase):
    def setUp(self):
        super().setUp()
        self.coach = make_user("coach", first_name="Carl", last_name="Coach")
        self.coach.email = "coach@example.ch"
        self.coach.save()
        self.nomail = make_user("nomail", first_name="No", last_name="Mail")

    def test_saves_users_and_addresses(self):
        response = self.save(
            self.anna,
            copy_users=[self.coach.pk],
            copy_emails=["office@example.ch", "Office@example.ch", "club@example.ch"],
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        data = response.data["invitation"]
        self.assertEqual(data["copy_users"], [self.coach.pk])
        self.assertEqual(data["copy_emails"], ["office@example.ch", "club@example.ch"])

    def test_rejects_invalid_addresses(self):
        response = self.save(self.anna, copy_emails=["not an address"])
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("copy_emails", response.data)

    def test_sends_a_copy_to_each_once(self):
        self.send(
            self.anna,
            head_referee=self.anna,
            copy_users=[self.coach.pk, self.nomail.pk],
            copy_emails=["office@example.ch", "ANNA@example.ch"],
        )
        recipients = sorted(m.to[0] for m in mail.outbox)
        self.assertEqual(
            recipients,
            [
                "anna@example.ch",
                "coach@example.ch",
                "invitor@example.ch",
                "office@example.ch",
            ],
        )
        copy = next(m for m in mail.outbox if m.to == ["office@example.ch"])
        self.assertTrue(copy.body.startswith("Hello"))
        self.assertIn("- Anna Arm (head referee)", copy.body)
        coach = next(m for m in mail.outbox if m.to == ["coach@example.ch"])
        self.assertTrue(coach.body.startswith("Dear Carl Coach"))

    def test_reports_recipients_without_email(self):
        response = self.send(
            self.anna, head_referee=self.anna, copy_users=[self.nomail.pk]
        )
        self.assertEqual(response.data["missing_email"], ["No Mail"])

    def test_carries_recipients_over_to_the_update(self):
        self.send(
            self.anna,
            head_referee=self.anna,
            copy_users=[self.coach.pk],
            copy_emails=["office@example.ch"],
        )
        data = self.client.get(self.url()).data["invitation"]
        self.assertEqual(data["copy_users"], [self.coach.pk])
        self.assertEqual(data["copy_emails"], ["office@example.ch"])


class TestStaffInvitesCancelled(InvitationTestCase):
    def setUp(self):
        super().setUp()
        self.cancelled = self.applied[self.cleo.pk]
        self.cancelled.status = Status.CANCELLED
        self.cancelled.save()
        self.declined = self.applied[self.ben.pk]
        self.declined.status = Status.DECLINED
        self.declined.save()

    def selectable(self):
        data = self.client.get(self.url()).data["applications"]
        return {a["user"]: a["selectable"] for a in data}

    def test_invitor_may_not_invite_cancelled(self):
        self.assertFalse(self.selectable()[self.cleo.pk])
        response = self.save(self.cleo)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.save(self.anna, head_referee=self.cleo)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(self.status_of(self.cleo), Status.CANCELLED)

    def test_invitor_may_invite_declined_again(self):
        self.assertTrue(self.selectable()[self.ben.pk])
        self.save(self.ben)
        self.assertEqual(self.status_of(self.ben), Status.SELECTED)

    def test_staff_and_superusers_may_select_and_invite_cancelled(self):
        for user in (
            make_user("staff", is_staff=True),
            make_user("root", is_superuser=True),
        ):
            with self.subTest(user=user.username):
                self.cancelled.status = Status.CANCELLED
                self.cancelled.save()
                self.client.force_authenticate(user)
                self.assertTrue(self.selectable()[self.cleo.pk])
                response = self.save(self.cleo, self.ben, head_referee=self.cleo)
                self.assertEqual(
                    response.status_code, status.HTTP_200_OK, response.data
                )
                self.assertEqual(self.status_of(self.cleo), Status.SELECTED)
                self.assertEqual(self.status_of(self.ben), Status.SELECTED)

    def test_staff_sends_to_cancelled(self):
        self.client.force_authenticate(make_user("staff", is_staff=True))
        response = self.send(self.cleo, head_referee=self.cleo)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(self.status_of(self.cleo), Status.INVITED)
        self.assertIn("cleo@example.ch", [m.to[0] for m in mail.outbox])

    def test_cancelled_stay_cancelled_when_not_selected(self):
        self.client.force_authenticate(make_user("staff", is_staff=True))
        self.send(self.anna, head_referee=self.anna)
        self.assertEqual(self.status_of(self.cleo), Status.CANCELLED)

    def test_selected_by_staff_can_be_kept_by_the_invitor(self):
        self.client.force_authenticate(make_user("staff", is_staff=True))
        self.save(self.cleo)
        self.client.force_authenticate(self.invitor)
        response = self.save(self.cleo, self.anna, head_referee=self.anna)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(self.status_of(self.cleo), Status.SELECTED)
