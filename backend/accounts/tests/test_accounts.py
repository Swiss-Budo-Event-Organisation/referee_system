from datetime import date
from datetime import timedelta
from unittest import mock

from django.contrib.auth.models import Group
from django.contrib.auth.models import User
from django.core import mail
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import PENDING_DAYS
from accounts.models import Account
from accounts.models import pending_users
from accounts.tasks import delete_expired_registrations
from accounts.tasks import send_pending_digest
from accounts.tokens import make_token
from api.tests.helpers import make_user
from referee.models import Examination
from referee.models import RefereeLicense

PASSWORD = "s3cret-Pa55word"


def registration(**data):
    return {
        "username": "newbie",
        "email": "newbie@example.com",
        "first_name": "Nina",
        "last_name": "Newbie",
        "password": PASSWORD,
        "password_repeat": PASSWORD,
        **data,
    }


def make_staff(username="staff", notifications=Account.Notifications.NEVER):
    user = make_user(username, email=f"{username}@example.com", is_staff=True)
    user.account.approval_notifications = notifications
    user.account.save()
    return user


def make_pending(username="newbie", days_ago=0):
    user = User.objects.create_user(
        username,
        email=f"{username}@example.com",
        password=PASSWORD,
        first_name="Nina",
        last_name="Newbie",
        is_active=False,
    )
    if days_ago:
        User.objects.filter(pk=user.pk).update(
            date_joined=timezone.now() - timedelta(days=days_ago)
        )
        user.refresh_from_db()
    return user


class TestRegister(APITestCase):
    def register(self, **data):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(
                reverse("user-register"), registration(**data), format="json"
            )

    def test_account_is_held_for_approval(self):
        response = self.register()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        user = User.objects.get(username="newbie")
        self.assertFalse(user.is_active)
        self.assertEqual(user.email, "newbie@example.com")
        self.assertEqual(user.get_full_name(), "Nina Newbie")
        self.assertTrue(user.account.is_pending)
        self.assertFalse(user.account.onboarded)
        self.assertFalse(user.account.email_confirmed)
        self.assertEqual(list(pending_users()), [user])

    def test_user_gets_an_email(self):
        self.register()
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["newbie@example.com"])
        self.assertIn("awaiting approval", message.subject)
        self.assertIn("Nina Newbie", message.body)

    def test_cannot_log_in_before_approval(self):
        self.register()
        response = self.client.post(
            reverse("token-get"),
            {"username": "newbie", "password": PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_passwords_must_match(self):
        response = self.register(password_repeat="other-Pa55word")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password_repeat", response.data)
        self.assertFalse(User.objects.filter(username="newbie").exists())

    def test_password_is_validated(self):
        response = self.register(password="12345678", password_repeat="12345678")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_required_fields(self):
        for field in ("email", "first_name", "last_name"):
            with self.subTest(field=field):
                response = self.register(**{field: ""})
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, response.data)

    def test_email_must_be_unused(self):
        make_user("jane", email="Newbie@Example.com")
        response = self.register()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_no_staff_fields(self):
        self.register(is_staff=True, is_active=True)
        user = User.objects.get(username="newbie")
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_active)

    def test_subscribed_staff_get_only_the_count(self):
        make_staff("now", Account.Notifications.IMMEDIATE)
        make_staff("daily", Account.Notifications.DAILY)
        make_staff("never")
        make_pending("earlier")

        self.register()

        to_staff = [m for m in mail.outbox if m.to != ["newbie@example.com"]]
        self.assertEqual([m.to for m in to_staff], [["now@example.com"]])
        body = to_staff[0].body
        self.assertIn("2 accounts are awaiting approval", body)
        self.assertIn("http://frontend.test/accounts/pending", body)
        for private in ("Nina", "Newbie", "newbie", "earlier", "@example.com"):
            self.assertNotIn(private, body)


class TestPendingList(APITestCase):
    def setUp(self):
        self.pending = make_pending()
        self.client.force_authenticate(make_staff())

    def test_staff_list_pending_accounts(self):
        make_user("active")
        response = self.client.get(reverse("pending-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([u["username"] for u in response.data], ["newbie"])
        entry = response.data[0]
        self.assertEqual(entry["email"], "newbie@example.com")
        self.assertEqual(entry["first_name"], "Nina")
        self.assertIn("expires", entry)

    def test_others_may_not(self):
        self.client.force_authenticate(make_user("john"))
        for method, url in [
            ("get", reverse("pending-list")),
            ("delete", reverse("pending-detail", args=[self.pending.pk])),
            ("post", reverse("pending-approve", args=[self.pending.pk])),
            ("get", reverse("group-list")),
        ]:
            with self.subTest(url=url):
                response = getattr(self.client, method)(url)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_pending_account(self):
        response = self.client.delete(reverse("pending-detail", args=[self.pending.pk]))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(pk=self.pending.pk).exists())

    def test_only_pending_accounts_can_be_deleted(self):
        active = make_user("active")
        response = self.client.delete(reverse("pending-detail", args=[active.pk]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(User.objects.filter(pk=active.pk).exists())

    def test_deactivated_account_is_not_pending(self):
        former = make_user("former")
        former.is_active = False
        former.save()
        self.assertNotIn(former, pending_users())

    def test_groups(self):
        response = self.client.get(reverse("group-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), Group.objects.count())
        self.assertEqual(set(response.data[0]), {"id", "name"})


class TestApproval(APITestCase):
    def setUp(self):
        self.pending = make_pending()
        self.staff = make_staff()
        self.client.force_authenticate(self.staff)

    def approve(self, data=None, user=None):
        url = reverse("pending-approve", args=[(user or self.pending).pk])
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.post(url, data or {}, format="json")

    def test_approve_with_groups_and_examinations(self):
        group = Group.objects.first()
        regional = RefereeLicense.objects.get(name="Regional")
        response = self.approve(
            {
                "groups": [group.pk],
                "examinations": [
                    {"license": regional.pk, "date": "2020-05-01", "grade": "5.5"}
                ],
            }
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.pending.refresh_from_db()
        self.assertTrue(self.pending.is_active)
        self.assertFalse(self.pending.account.is_pending)
        self.assertEqual(self.pending.account.approved_by, self.staff)
        self.assertIn(group, self.pending.groups.all())
        exam = Examination.objects.get(candidate__user=self.pending)
        self.assertEqual(exam.license, regional)
        self.assertEqual(exam.date, date(2020, 5, 1))
        self.assertTrue(exam.passed)

    def test_approval_email_confirms_address(self):
        self.approve()

        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.to, ["newbie@example.com"])
        link = next(
            line for line in message.body.splitlines() if "confirm-email" in line
        )
        self.assertTrue(link.startswith("http://frontend.test/confirm-email?token="))
        token = link.split("token=", 1)[1]

        self.client.force_authenticate(None)
        response = self.client.post(
            reverse("confirm-email"), {"token": token}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.pending.refresh_from_db()
        self.assertTrue(self.pending.account.email_confirmed)

        response = self.client.post(
            reverse("token-get"),
            {"username": "newbie", "password": PASSWORD},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_invalid_examination_rolls_back(self):
        response = self.approve({"examinations": [{"license": 9999, "date": "x"}]})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.pending.refresh_from_db()
        self.assertFalse(self.pending.is_active)
        self.assertEqual(mail.outbox, [])

    def test_only_pending_accounts(self):
        response = self.approve(user=make_user("active"))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class TestEmailConfirmation(APITestCase):
    def setUp(self):
        self.user = make_user("john", email="john@example.com")

    def confirm(self, token):
        return self.client.post(
            reverse("confirm-email"), {"token": token}, format="json"
        )

    def test_confirm(self):
        response = self.confirm(make_token(self.user))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.account.email_confirmed)

    def test_bad_tokens(self):
        token = make_token(self.user)
        with mock.patch("accounts.tokens.MAX_AGE", timedelta(seconds=-1)):
            self.assertEqual(self.confirm(token).status_code, 400)
        self.assertEqual(self.confirm(token + "x").status_code, 400)
        self.user.email = "new@example.com"
        self.user.save()
        self.assertEqual(self.confirm(token).status_code, 400)
        self.user.refresh_from_db()
        self.assertFalse(self.user.account.email_confirmed)

    def test_inactive_user(self):
        token = make_token(self.user)
        self.user.is_active = False
        self.user.save()
        self.assertEqual(self.confirm(token).status_code, 400)

    def test_changed_address_is_unconfirmed(self):
        self.confirm(make_token(self.user))
        self.client.force_authenticate(self.user)
        url = reverse("user", args=[self.user.pk])
        self.assertTrue(self.client.get(url).data["email_confirmed"])

        response = self.client.patch(url, {"email": "new@example.com"}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertFalse(response.data["email_confirmed"])

    def test_email_must_be_unused_on_change(self):
        make_user("jane", email="jane@example.com")
        self.client.force_authenticate(self.user)
        response = self.client.patch(
            reverse("user", args=[self.user.pk]),
            {"email": "JANE@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_send_confirmation(self):
        self.client.force_authenticate(self.user)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(reverse("confirm-email-send"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("confirm-email?token=", mail.outbox[0].body)

        self.confirm(make_token(self.user))
        mail.outbox.clear()
        response = self.client.post(reverse("confirm-email-send"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(mail.outbox, [])


class TestProfileState(APITestCase):
    def setUp(self):
        self.user = make_user("john")
        self.user.account.onboarded = False
        self.user.account.save()
        self.client.force_authenticate(self.user)
        self.url = reverse("user", args=[self.user.pk])

    def test_state_in_profile(self):
        data = self.client.get(self.url).data
        self.assertFalse(data["onboarded"])
        self.assertFalse(data["email_confirmed"])
        self.assertEqual(data["approval_notifications"], "never")

    def test_onboarding_needs_name(self):
        response = self.client.patch(self.url, {"onboarded": True}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("first_name", response.data)

        response = self.client.patch(
            self.url,
            {
                "first_name": "John",
                "last_name": "Doe",
                "onboarded": True,
                "referee": {"phone": "031 000 00 00", "share_phone": True},
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.account.onboarded)
        self.assertEqual(self.user.referee.phone, "031 000 00 00")

    def test_optional_fields_may_be_empty(self):
        # What the onboarding form sends when only the name is filled in.
        response = self.client.patch(
            self.url,
            {
                "first_name": "John",
                "last_name": "Doe",
                "onboarded": True,
                "referee": {
                    "phone": "",
                    "mobile": "",
                    "dob": None,
                    "iban": "",
                    "share_email": False,
                    "share_phone": False,
                    "share_mobile": False,
                    "share_dob": False,
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.user.refresh_from_db()
        self.assertTrue(self.user.account.onboarded)
        self.assertEqual(self.user.referee.phone, "")

    def test_only_staff_subscribe(self):
        response = self.client.patch(
            self.url, {"approval_notifications": "daily"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        staff = make_staff()
        self.client.force_authenticate(staff)
        response = self.client.patch(
            reverse("user", args=[staff.pk]),
            {"approval_notifications": "weekly"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        staff.refresh_from_db()
        self.assertEqual(staff.account.approval_notifications, "weekly")


class TestScheduledTasks(TestCase):
    def test_digest(self):
        make_staff("daily", Account.Notifications.DAILY)
        make_staff("weekly", Account.Notifications.WEEKLY)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(send_pending_digest("daily"), 0)
        self.assertEqual(mail.outbox, [])

        make_pending()
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(send_pending_digest("daily"), 1)
        self.assertEqual([m.to for m in mail.outbox], [["daily@example.com"]])
        self.assertIn("1 account is awaiting approval", mail.outbox[0].body)
        self.assertNotIn("Nina", mail.outbox[0].body)

    def test_inactive_staff_get_no_digest(self):
        member = make_staff("daily", Account.Notifications.DAILY)
        member.is_active = False
        member.save()
        make_pending()
        self.assertEqual(send_pending_digest("daily"), 0)

    def test_delete_expired_registrations(self):
        old = make_pending("old", days_ago=PENDING_DAYS + 1)
        recent = make_pending("recent", days_ago=PENDING_DAYS - 1)
        approved_long_ago = make_user("member")
        User.objects.filter(pk=approved_long_ago.pk).update(
            date_joined=timezone.now() - timedelta(days=400)
        )

        self.assertEqual(delete_expired_registrations(), 1)

        remaining = set(User.objects.values_list("pk", flat=True))
        self.assertNotIn(old.pk, remaining)
        self.assertIn(recent.pk, remaining)
        self.assertIn(approved_long_ago.pk, remaining)

    def test_schedule(self):
        from django.conf import settings

        from ref_sys.celery import app

        tasks = {entry["task"] for entry in settings.CELERY_BEAT_SCHEDULE.values()}
        self.assertEqual(
            tasks,
            {
                "accounts.tasks.send_pending_digest",
                "accounts.tasks.delete_expired_registrations",
            },
        )
        for task in tasks:
            self.assertIn(task, app.tasks)


class TestAccountSignal(TestCase):
    def test_active_users_count_as_approved(self):
        user = make_user("john")
        self.assertIsNotNone(user.account.approved)
        self.assertTrue(user.account.onboarded)
        self.assertFalse(user.account.is_pending)

    def test_inactive_users_are_pending(self):
        user = make_pending()
        self.assertTrue(user.account.is_pending)
        self.assertFalse(user.account.onboarded)
