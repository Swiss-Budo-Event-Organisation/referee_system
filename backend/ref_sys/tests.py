"""
Project-level smoke tests: admin, signals, mail task, Celery and URL wiring.
"""

from datetime import timedelta

from django.apps import apps
from django.contrib import admin
from django.contrib.auth.models import User
from django.core import mail
from django.test import TestCase
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone

from api.tests.helpers import make_competition
from api.tests.helpers import make_event
from api.tests.helpers import make_user
from competition.models import Accommodation
from competition.models import Application
from competition.models import Invitation
from competition.tasks import send_mails
from helper.models import Address
from referee.models import Examination
from referee.models import Referee
from referee.models import RefereeLicense
from referee.models import RefereeRole

PROJECT_APPS = {"accounts", "competition", "referee", "helper"}


class TestAdmin(TestCase):
    def setUp(self):
        self.superuser = User.objects.create_superuser(
            "root", "root@example.com", "s3cret-Pa55word"
        )
        self.client.force_login(self.superuser)

        referee = self.superuser.referee
        event = make_event()
        competition = make_competition(event, referee)
        accommodation = Accommodation.objects.create(
            event=event,
            name="Hotel",
            address=Address.objects.create(street="Hotel Street", city="Bern"),
        )
        application = Application.objects.create(
            user=referee, competition=competition, accommodation=accommodation
        )
        invitation = Invitation.objects.create(
            competition=competition, subject="Welcome"
        )
        invitation.invited.add(application)
        Examination.create(
            referee,
            license=RefereeLicense.objects.get(name="Regional"),
            date=timezone.now().date(),
        )
        RefereeRole.objects.get_or_create(name="Test role", defaults={"order": 1})

    def registered_project_models(self):
        return [
            model
            for model in admin.site._registry
            if model._meta.app_label in PROJECT_APPS
        ]

    def test_all_project_models_are_registered(self):
        expected = {
            model
            for model in apps.get_models()
            if model._meta.app_label in PROJECT_APPS
        }
        self.assertEqual(set(self.registered_project_models()), expected)

    def test_admin_index(self):
        response = self.client.get(reverse("admin:index"))
        self.assertEqual(response.status_code, 200)

    def test_changelist_add_and_change_pages(self):
        for model in self.registered_project_models():
            info = model._meta.app_label, model._meta.model_name
            with self.subTest(model=model.__name__):
                response = self.client.get(
                    reverse("admin:{}_{}_changelist".format(*info))
                )
                self.assertEqual(response.status_code, 200)
                response = self.client.get(reverse("admin:{}_{}_add".format(*info)))
                self.assertEqual(response.status_code, 200)
                obj = model.objects.first()
                self.assertIsNotNone(obj)
                response = self.client.get(
                    reverse("admin:{}_{}_change".format(*info), args=[obj.pk])
                )
                self.assertEqual(response.status_code, 200)

    def test_celery_admin_pages(self):
        for name in [
            "admin:django_celery_results_taskresult_changelist",
            "admin:django_celery_beat_periodictask_changelist",
            "admin:django_celery_beat_crontabschedule_changelist",
        ]:
            with self.subTest(name=name):
                self.assertEqual(self.client.get(reverse(name)).status_code, 200)

    def test_admin_login_with_password(self):
        self.client.logout()
        response = self.client.post(
            reverse("admin:login"),
            {"username": "root", "password": "s3cret-Pa55word", "next": "/admin/"},
        )
        self.assertRedirects(response, "/admin/")


class TestRefereeSignal(TestCase):
    def test_profile_created_once(self):
        user = make_user("john")
        self.assertEqual(Referee.objects.filter(user=user).count(), 1)
        user.first_name = "John"
        user.save()
        self.assertEqual(Referee.objects.filter(user=user).count(), 1)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class TestSendMails(TestCase):
    def test_send_mails_task(self):
        messages = [
            mail.EmailMessage("Subject 1", "Body", to=["a@example.com"]),
            mail.EmailMessage("Subject 2", "Body", to=["b@example.com"]),
        ]
        send_mails(messages)
        self.assertEqual([m.subject for m in mail.outbox], ["Subject 1", "Subject 2"])

    def test_task_is_registered_with_celery(self):
        from ref_sys.celery import app

        self.assertIn("competition.tasks.send_mails", app.tasks)
        self.assertEqual(app.conf.result_backend, "django-db")
        self.assertTrue(app.conf.result_extended)


class TestModelsStillBehave(TestCase):
    """A few model behaviours that depend on Django internals."""

    def test_event_slug_deduplicated_per_year(self):
        start = timezone.now() + timedelta(days=3)
        first = make_event("Cup", start)
        second = make_event("Cup", start, location=first.location)
        self.assertEqual(first.slug, "cup")
        self.assertEqual(second.slug, "cup-1")

    def test_application_str(self):
        user = make_user("john", first_name="John", last_name="Doe")
        competition = make_competition(make_event("Cup"), user.referee)
        application = Application.objects.create(
            user=user.referee, competition=competition
        )
        self.assertEqual(
            str(application),
            f"Application: Cup ({competition.start.date()}) by John Doe",
        )
