from datetime import date
from datetime import timedelta

from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from api.serializers import UserSerializer
from api.tests.helpers import grant
from api.tests.helpers import make_competition
from api.tests.helpers import make_event
from api.tests.helpers import make_location
from api.tests.helpers import make_user
from competition.models import Application
from competition.models import Event
from helper.models import Address
from referee.models import Examination
from referee.models import RefereeLicense


class AuthenticatedTestCase(APITestCase):
    def setUp(self):
        self.user = make_user("john", first_name="John", last_name="Doe")
        self.client.force_authenticate(self.user)


class TestAnonymousAccess(APITestCase):
    def test_endpoints_require_authentication(self):
        event = make_event()
        urls = [
            reverse("event-list"),
            reverse("event-list-future"),
            reverse("event-detail", args=[event.pk]),
            reverse("locations-list"),
            reverse("license-list"),
            reverse("application-create-list"),
            reverse("examinations-user"),
            reverse("user", args=[1]),
        ]
        for url in urls:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class TestEvents(AuthenticatedTestCase):
    def test_list_events(self):
        location = make_location()
        make_event("Past Event", timezone.now() - timedelta(days=5), location)
        make_event("Future Event", timezone.now() + timedelta(days=5), location)

        response = self.client.get(reverse("event-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [e["name"] for e in response.data], ["Past Event", "Future Event"]
        )
        event = response.data[1]
        self.assertEqual(event["slug"], "future-event")
        self.assertEqual(event["location"]["name"], "Dojo")
        self.assertEqual(event["competitions"], [])

    def test_list_future_events(self):
        location = make_location()
        make_event("Past Event", timezone.now() - timedelta(days=5), location)
        make_event("Future Event", timezone.now() + timedelta(days=5), location)

        response = self.client.get(reverse("event-list-future"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([e["name"] for e in response.data], ["Future Event"])

    def test_event_detail_includes_competitions(self):
        event = make_event()
        competition = make_competition(event, self.user.referee)

        response = self.client.get(reverse("event-detail", args=[event.pk]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Test Event")
        self.assertEqual(len(response.data["competitions"]), 1)
        comp = response.data["competitions"][0]
        self.assertEqual(comp["id"], competition.pk)
        self.assertEqual(comp["duration"], "08:00:00")
        self.assertEqual(len(comp["category"]), 1)

    def test_event_update_requires_permission(self):
        event = make_event()
        url = reverse("event-detail", args=[event.pk])

        response = self.client.patch(url, {"info": "Updated"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(grant(self.user, "change_event"))
        response = self.client.patch(url, {"info": "Updated"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        event.refresh_from_db()
        self.assertEqual(event.info, "Updated")

    def test_event_delete_requires_permission(self):
        event = make_event()
        url = reverse("event-detail", args=[event.pk])

        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(grant(self.user, "delete_event"))
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Event.objects.filter(pk=event.pk).exists())

    def test_event_slug_unique_for_year(self):
        location = make_location()
        start = timezone.now() + timedelta(days=5)
        make_event("First", start, location, slug="same")
        other = make_event("Second", start, location, slug="other")
        self.client.force_authenticate(grant(self.user, "change_event"))

        response = self.client.patch(
            reverse("event-detail", args=[other.pk]),
            {"slug": "same", "start": start.isoformat()},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("slug", response.data)

    def test_missing_event_returns_404(self):
        response = self.client.get(reverse("event-detail", args=[9999]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class TestCompetition(AuthenticatedTestCase):
    def test_competition_overview(self):
        event = make_event()
        competition = make_competition(event, self.user.referee, info="Bring a suit")

        response = self.client.get(reverse("competition-detail", args=[competition.pk]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(set(response.data), {"id", "event", "start", "info"})
        self.assertEqual(response.data["info"], "Bring a suit")
        self.assertEqual(response.data["event"]["name"], "Test Event")
        self.assertEqual(response.data["event"]["location"]["name"], "Dojo")


class TestLocations(AuthenticatedTestCase):
    def test_list_and_detail(self):
        location = make_location("Arena")

        response = self.client.get(reverse("locations-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            [
                {
                    "id": location.pk,
                    "name": "Arena",
                    "description": "",
                    "address": location.address.pk,
                }
            ],
        )

        response = self.client.get(reverse("locations-detail", args=[location.pk]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Arena")


class TestLicenses(AuthenticatedTestCase):
    def test_list_default_licenses(self):
        response = self.client.get(reverse("license-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = {lic["name"] for lic in response.data}
        self.assertEqual(
            names,
            {
                "IJF Intercontinental",
                "IJF Continental",
                "National A",
                "National B",
                "Regional",
            },
        )
        regional = next(lic for lic in response.data if lic["name"] == "Regional")
        self.assertEqual(
            regional["parent"], RefereeLicense.objects.get(name="National B").pk
        )


class TestAddress(AuthenticatedTestCase):
    def test_retrieve_and_update(self):
        address = Address.objects.create(street="Old Street", city="Bern")
        url = reverse("address-update", args=[address.pk])

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["street"], "Old Street")

        response = self.client.patch(
            url, {"street": "New Street", "house_number": "4"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        address.refresh_from_db()
        self.assertEqual(str(address), "New Street 4, Bern, ")


class TestUser(AuthenticatedTestCase):
    def test_own_user_detail(self):
        response = self.client.get(reverse("user", args=[self.user.pk]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], "john")
        self.assertEqual(response.data["first_name"], "John")
        self.assertNotIn("password", response.data)
        self.assertEqual(response.data["referee"]["id"], self.user.referee.pk)
        self.assertEqual(
            set(response.data["referee"]),
            {"id", "address", "dob", "iban", "phone", "mobile"},
        )
        self.assertEqual(response.data["permissions"], [])
        self.assertFalse(response.data["is_staff"])

    def urls(self, user=None):
        pk = (user or self.user).pk
        return [f"/api/user/{pk}/", f"/api/user/{pk}/update/"]

    def test_staff_flag_is_read_only(self):
        for url in self.urls():
            with self.subTest(url=url):
                response = self.client.patch(url, {"is_staff": True}, format="json")
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.user.refresh_from_db()
                self.assertFalse(self.user.is_staff)

    def test_updates_own_user_and_referee(self):
        for url in self.urls():
            with self.subTest(url=url):
                data = {
                    "first_name": "Johnny",
                    "referee": {"phone": "+41 31 000 00 00"},
                }
                response = self.client.patch(url, data, format="json")
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data["first_name"], "Johnny")
                self.user.refresh_from_db()
                self.assertEqual(self.user.first_name, "Johnny")
                self.assertEqual(self.user.last_name, "Doe")
                self.assertEqual(self.user.referee.phone, "+41 31 000 00 00")

    def test_password_is_hashed(self):
        response = self.client.patch(
            self.urls()[0], {"password": "n3w-Pa55word"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("n3w-Pa55word"))
        self.assertNotEqual(self.user.password, "n3w-Pa55word")

    def test_cannot_change_other_users(self):
        other = make_user("jane", first_name="Jane")
        for url in self.urls(other):
            with self.subTest(url=url):
                response = self.client.patch(url, {"first_name": "X"}, format="json")
                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        other.refresh_from_db()
        self.assertEqual(other.first_name, "Jane")

    def test_staff_changes_other_users(self):
        other = make_user("jane", first_name="Jane")
        self.client.force_authenticate(make_user("staff", is_staff=True))
        response = self.client.patch(
            self.urls(other)[1], {"first_name": "Janet"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        other.refresh_from_db()
        self.assertEqual(other.first_name, "Janet")

    def test_serializer_creates_user_with_referee(self):
        serializer = UserSerializer(
            data={
                "username": "new",
                "password": "s3cret-Pa55word",
                "referee": {"phone": "123"},
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        user = serializer.save()
        self.assertTrue(user.check_password("s3cret-Pa55word"))
        self.assertEqual(user.referee.phone, "123")

    def test_permissions_of_the_user(self):
        self.user.groups.add(Group.objects.get(name="Region 1 Admin"))
        response = self.client.get(reverse("user", args=[self.user.pk]))
        self.assertIn("competition.add_event", response.data["permissions"])


class TestApplications(AuthenticatedTestCase):
    def setUp(self):
        super().setUp()
        self.event = make_event()
        self.competition = make_competition(self.event, self.user.referee)
        self.user.groups.add(Group.objects.get(name="National"))
        Examination.create(
            self.user,
            license=RefereeLicense.objects.get(name="Regional"),
            date=date(2024, 5, 1),
        )

    def member(self, username, group="National"):
        """A user in the member group of a category."""
        user = make_user(username)
        user.groups.add(Group.objects.get(name=group))
        return user

    def test_only_members_of_a_category_may_apply(self):
        cases = {
            "nobody": make_user("nobody"),
            "admin": self.member("admin", "National Admin"),
            "observer": self.member("observer", "National Observer"),
            "other category": self.member("other", "Region 1"),
        }
        for name, user in cases.items():
            with self.subTest(user=name):
                response = self.apply(self.competition, user)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
                self.assertEqual(
                    response.data["detail"],
                    "Only members of one of the competition's categories may apply.",
                )
        self.assertFalse(Application.objects.exists())

        # self.user is in the National member group and has a license.
        response = self.apply(self.competition)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def apply(self, competition, user=None):
        user = user or self.user
        self.client.force_authenticate(user)
        return self.client.post(
            reverse("application-create-list"),
            {"user": user.referee.pk, "competition": competition.pk},
            format="json",
        )

    def test_license_needed_to_apply(self):
        competition = make_competition(
            self.event,
            self.user.referee,
            minimum_level=RefereeLicense.objects.get(name="National B"),
        )

        response = self.apply(competition)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["competition"],
            ["You need at least the National B license to apply."],
        )
        self.assertEqual(self.apply(competition, self.member("jane")).status_code, 400)
        self.assertFalse(Application.objects.exists())

    def test_no_license_needed_without_minimum(self):
        competition = make_competition(
            self.event, self.user.referee, minimum_level=None
        )

        response = self.apply(competition, self.member("jane"))

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_apply_for_competition(self):
        response = self.client.post(
            reverse("application-create-list"),
            {"user": self.user.referee.pk, "competition": self.competition.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        application = Application.objects.get()
        self.assertEqual(application.user, self.user.referee)
        self.assertEqual(application.status, Application.Status.APPLIED)

    def test_apply_without_registration_dates(self):
        self.competition.application_open = None
        self.competition.application_close = None
        self.competition.save()

        response = self.client.post(
            reverse("application-create-list"),
            {"user": self.user.referee.pk, "competition": self.competition.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_cannot_apply_outside_registration(self):
        now = timezone.now()
        cases = {
            "not yet open": {"application_open": now + timedelta(days=1)},
            "closed": {"application_close": now - timedelta(minutes=1)},
            "switched off": {"application": False},
            "started": {
                "application_close": None,
                "start": now - timedelta(hours=1),
            },
        }
        for name, fields in cases.items():
            with self.subTest(name):
                competition = make_competition(self.event, self.user.referee, **fields)

                response = self.client.post(
                    reverse("application-create-list"),
                    {"user": self.user.referee.pk, "competition": competition.pk},
                    format="json",
                )

                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertEqual(
                    response.data["competition"],
                    ["Registration for this competition is closed."],
                )
        self.assertFalse(Application.objects.exists())

    def test_cannot_apply_for_someone_else(self):
        other = self.member("jane")
        response = self.client.post(
            reverse("application-create-list"),
            {"user": other.referee.pk, "competition": self.competition.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Application.objects.exists())

    def test_only_one_application_per_competition(self):
        data = {"user": self.user.referee.pk, "competition": self.competition.pk}
        url = reverse("application-create-list")
        self.assertEqual(
            self.client.post(url, data, format="json").status_code,
            status.HTTP_201_CREATED,
        )

        response = self.client.post(url, data, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Application.objects.count(), 1)

    def test_list_only_own_applications(self):
        other = self.member("jane")
        Application.objects.create(user=self.user.referee, competition=self.competition)
        Application.objects.create(user=other.referee, competition=self.competition)

        response = self.client.get(reverse("application-create-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["user"], self.user.referee.pk)


class TestExaminations(AuthenticatedTestCase):
    def test_list_only_own_examinations(self):
        other = make_user("jane")
        regional = RefereeLicense.objects.get(name="Regional")
        Examination.create(self.user, license=regional, date=date(2024, 5, 1))
        Examination.create(other, license=regional, date=date(2024, 5, 2))

        response = self.client.get(reverse("examinations-user"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        exam = response.data[0]
        self.assertEqual(exam["candidate"], self.user.referee.pk)
        self.assertEqual(exam["date"], "2024-05-01")
        self.assertTrue(exam["passed"])
