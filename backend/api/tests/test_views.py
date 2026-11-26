from datetime import UTC
from datetime import date
from datetime import datetime
from datetime import timedelta

from django.contrib.auth.models import Group
from django.db.models import ProtectedError
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
from competition.models import CompetitionCategory
from competition.models import Event
from competition.models import Invitation
from competition.serializers import AccommodationSerializer
from helper.models import Address
from helper.models import Location
from helper.serializers import LocationSerializer
from referee.models import Examination
from referee.models import RefereeLicense
from referee.serializers import ExaminationSerializer


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
            reverse("profile-list"),
            reverse("profile-detail", args=[1]),
            reverse("address-detail", args=[1]),
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
        url = reverse("address-detail", args=[address.pk])

        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["street"], "Old Street")

        response = self.client.patch(url, {"street": "New Street"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(grant(self.user, "change_address"))
        response = self.client.patch(
            url, {"street": "New Street", "house_number": "4"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        address.refresh_from_db()
        self.assertEqual(str(address), "New Street 4, Bern, ")

    def test_staff_may_update_any_address(self):
        self.client.force_authenticate(make_user("staff", is_staff=True))
        public = Address.objects.create(street="Old Street", city="Bern")
        _, personal = self.make_personal()
        for url in (reverse("address-detail", args=[public.pk]), personal):
            with self.subTest(url=url):
                response = self.client.patch(url, {"city": "Biel"}, format="json")
                self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Address.objects.filter(city="Biel").count(), 2)

    def test_category_admin_may_update_public_address(self):
        CompetitionCategory.objects.get(name="National").admins.user_set.add(self.user)
        address = Address.objects.create(street="Old Street", city="Bern")
        url = reverse("address-detail", args=[address.pk])
        response = self.client.patch(url, {"street": "New Street"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def create(self, **data):
        fields = {"street": "Home Street", "house_number": "1", "city": "Bern"}
        return self.client.post(
            reverse("address-create"), {**fields, **data}, format="json"
        )

    def test_create_personal_address(self):
        old = Address.objects.create(street="Old Street", city="Thun")
        self.user.referee.address = old
        self.user.referee.save()

        response = self.create()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn("personal", response.data)
        self.user.referee.refresh_from_db()
        self.assertEqual(self.user.referee.address_id, response.data["id"])
        # The previous personal address is gone.
        self.assertFalse(Address.objects.filter(pk=old.pk).exists())

    def test_create_public_address_requires_permission(self):
        response = self.create(personal=False)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Address.objects.exists())

    def test_create_public_address(self):
        self.client.force_authenticate(grant(self.user, "add_address"))
        response = self.create(personal=False)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        address = Address.objects.get(pk=response.data["id"])
        self.assertFalse(address.is_personal)
        self.user.referee.refresh_from_db()
        self.assertIsNone(self.user.referee.address)

    def test_personal_address_cannot_be_deleted(self):
        other, url = self.make_personal()
        for user in (other, make_user("staff", is_staff=True)):
            with self.subTest(user=user.username):
                self.client.force_authenticate(user)
                response = self.client.delete(url)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Address.objects.filter(street="Home Street").exists())

    def test_delete_public_address(self):
        address = Address.objects.create(street="Old Street", city="Bern")
        url = reverse("address-detail", args=[address.pk])
        self.assertEqual(self.client.delete(url).status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(grant(self.user, "delete_address"))
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Address.objects.filter(pk=address.pk).exists())

    def test_used_public_address_cannot_be_deleted(self):
        location = make_location()
        self.client.force_authenticate(make_user("staff", is_staff=True))
        url = reverse("address-detail", args=[location.address_id])
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Address.objects.filter(pk=location.address_id).exists())

    def make_personal(self, username="jane"):
        """Another user with a personal address, which they share."""
        other = make_user(username)
        address = Address.objects.create(street="Home Street", city="Thun")
        other.referee.address = address
        other.referee.share_address = True
        other.referee.save()
        return other, reverse("address-detail", args=[address.pk])

    def test_personal_address_hidden_from_others(self):
        # Even if shared: others see it only in the profile.
        _, url = self.make_personal()
        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)
        response = self.client.patch(url, {"street": "X"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_own_personal_address(self):
        other, url = self.make_personal()
        self.client.force_authenticate(other)
        self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)
        response = self.client.patch(url, {"street": "New Street"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_staff_sees_personal_address(self):
        _, url = self.make_personal()
        self.client.force_authenticate(make_user("staff", is_staff=True))
        self.assertEqual(self.client.get(url).status_code, status.HTTP_200_OK)

    def test_personal_address_is_protected(self):
        other, _ = self.make_personal()
        with self.assertRaises(ProtectedError):
            other.referee.address.delete()

    def test_personal_address_deleted_with_user(self):
        other, _ = self.make_personal()
        other.delete()
        self.assertFalse(Address.objects.filter(street="Home Street").exists())

    def test_former_personal_address_deleted(self):
        other, _ = self.make_personal()
        old = other.referee.address
        other.referee.address = Address.objects.create(street="New", city="Bern")
        other.referee.save()
        self.assertFalse(Address.objects.filter(pk=old.pk).exists())

    def test_remove_own_address(self):
        other, _ = self.make_personal()
        self.client.force_authenticate(other)
        response = self.client.patch(
            reverse("user", args=[other.pk]),
            {"referee": {"address": None}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        other.referee.refresh_from_db()
        self.assertIsNone(other.referee.address)
        self.assertFalse(Address.objects.filter(street="Home Street").exists())

    def test_personal_address_not_for_exams_or_accommodations(self):
        other, _ = self.make_personal()
        address = other.referee.address
        exam = ExaminationSerializer(
            data={
                "candidate": self.user.referee.pk,
                "license": RefereeLicense.objects.get(name="Regional").pk,
                "date": "2024-05-01",
                "address": address.pk,
            }
        )
        self.assertFalse(exam.is_valid())
        self.assertIn("address", exam.errors)
        accommodation = AccommodationSerializer(
            data={"event": make_event().pk, "name": "Hotel", "address": address.pk}
        )
        self.assertFalse(accommodation.is_valid())
        self.assertIn("address", accommodation.errors)

    def test_location_does_not_reuse_personal_address(self):
        other, _ = self.make_personal()
        location = LocationSerializer().create(
            {"name": "Dojo", "address": {"street": "Home Street", "city": "Thun"}}
        )
        self.assertNotEqual(location.address_id, other.referee.address_id)
        self.assertEqual(str(location.address), str(other.referee.address))


class TestProfiles(AuthenticatedTestCase):
    FLAGS = {
        "email": "share_email",
        "phone": "share_phone",
        "mobile": "share_mobile",
        "dob": "share_dob",
        "address": "share_address",
    }

    def make_other(self, **flags):
        other = make_user(
            "jane", first_name="Jane", last_name="Roe", email="jane@example.com"
        )
        referee = other.referee
        referee.address = Address.objects.create(
            street="Home Street", house_number="3", city="Thun"
        )
        referee.phone = "031 000 00 00"
        referee.mobile = "079 000 00 00"
        referee.iban = "CH00 0000 0000 0000 0000 0"
        referee.dob = date(1990, 1, 1)
        for flag, value in flags.items():
            setattr(referee, flag, value)
        referee.save()
        return other

    def profile(self, user):
        response = self.client.get(reverse("profile-detail", args=[user.pk]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        return response.data

    def assert_never_private(self, data):
        for field in ("iban", "permissions", "is_staff", "password"):
            self.assertNotIn(field, data)
        self.assertNotIn("CH00", str(data))

    def test_redacted_by_default(self):
        data = self.profile(self.make_other())
        self.assertEqual(data["name"], "Jane Roe")
        for field in self.FLAGS:
            self.assertIsNone(data[field], field)
        self.assert_never_private(data)

    def test_each_flag_shares_only_its_field(self):
        expected = {
            "email": "jane@example.com",
            "phone": "031 000 00 00",
            "mobile": "079 000 00 00",
            "dob": "1990-01-01",
        }
        for field, flag in self.FLAGS.items():
            with self.subTest(flag=flag):
                other = self.make_other(**{flag: True})
                data = self.profile(other)
                if field == "address":
                    self.assertEqual(data["address"]["street"], "Home Street")
                else:
                    self.assertEqual(data[field], expected[field])
                for hidden in set(self.FLAGS) - {field}:
                    self.assertIsNone(data[hidden], hidden)
                self.assert_never_private(data)
                other.delete()

    def test_list_profiles(self):
        self.make_other(share_phone=True)
        make_user("inactive", is_active=False)

        response = self.client.get(reverse("profile-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        by_name = {p["username"]: p for p in response.data}
        self.assertEqual(sorted(by_name), ["jane", "john"])
        self.assertEqual(by_name["jane"]["phone"], "031 000 00 00")
        self.assertIsNone(by_name["jane"]["email"])
        for profile in response.data:
            self.assert_never_private(profile)

    def test_full_profile_only_for_owner_and_staff(self):
        other = self.make_other()
        url = reverse("user", args=[other.pk])
        self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)

        self.client.force_authenticate(make_user("staff", is_staff=True))
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "jane@example.com")
        self.assertEqual(response.data["referee"]["iban"], "CH00 0000 0000 0000 0000 0")

    def test_owner_sets_flags(self):
        response = self.client.patch(
            reverse("user", args=[self.user.pk]),
            {"referee": {"share_email": True, "share_mobile": True}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.user.referee.refresh_from_db()
        self.assertTrue(self.user.referee.share_email)
        self.assertTrue(self.user.referee.share_mobile)
        self.assertFalse(self.user.referee.share_phone)
        self.assertFalse(self.user.referee.share_dob)
        self.assertFalse(self.user.referee.share_address)

    def test_own_address_must_be_unused(self):
        url = reverse("user", args=[self.user.pk])
        venue = make_location().address
        jane = make_user("jane")
        jane.referee.address = Address.objects.create(street="Home", city="Thun")
        jane.referee.save()
        for address in (venue, jane.referee.address):
            with self.subTest(address=address.street):
                response = self.client.patch(
                    url, {"referee": {"address": address.pk}}, format="json"
                )
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        mine = Address.objects.create(street="My Street", city="Bern")
        for _ in range(2):  # Setting it again keeps it.
            response = self.client.patch(
                url, {"referee": {"address": mine.pk}}, format="json"
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.user.referee.refresh_from_db()
        self.assertEqual(self.user.referee.address, mine)


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
            {
                "id",
                "address",
                "dob",
                "iban",
                "phone",
                "mobile",
                "share_email",
                "share_phone",
                "share_mobile",
                "share_dob",
                "share_address",
            },
        )
        self.assertIn("email", response.data)
        flags = ("share_email", "share_phone", "share_mobile", "share_dob")
        for flag in (*flags, "share_address"):
            self.assertFalse(response.data["referee"][flag], flag)
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
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["user"], self.user.referee.pk)

    def test_list_the_latest_competitions_first_in_pages(self):
        first = self.competition.start
        applications = []
        for days in range(25):
            competition = make_competition(
                make_event(f"Event {days}", start=first + timedelta(days=days)),
                self.user.referee,
            )
            applications.append(
                Application.objects.create(
                    user=self.user.referee, competition=competition
                )
            )
        latest_first = [a.pk for a in reversed(applications)]

        response = self.client.get(reverse("application-create-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 25)
        self.assertEqual([a["id"] for a in response.data["results"]], latest_first[:20])
        self.assertIsNotNone(response.data["next"])

        response = self.client.get(reverse("application-create-list"), {"page": 2})
        self.assertEqual([a["id"] for a in response.data["results"]], latest_first[20:])
        self.assertIsNone(response.data["next"])


class TestApplicationSearch(AuthenticatedTestCase):
    def setUp(self):
        super().setUp()
        lausanne = Location.objects.create(
            name="Salle Omnisport",
            description="Next to the lake",
            address=Address.objects.create(
                street="Rue du Lac", area_code="1007", city="Lausanne"
            ),
        )
        self.old = self.apply(
            "Swiss Open",
            datetime(2015, 3, 1, 9, tzinfo=UTC),
            status=Application.Status.PARTICIPATED,
            info="Kata and kumite",
        )
        self.lake = self.apply(
            "Lake Cup",
            datetime(2018, 6, 1, 9, tzinfo=UTC),
            location=lausanne,
            status=Application.Status.DECLINED,
            accommodation_remark="Arriving by train",
        )
        self.recent = self.apply(
            "Swiss Open",
            datetime(2024, 3, 1, 9, tzinfo=UTC),
            status=Application.Status.INVITED,
        )
        # Applications of others are never found.
        Application.objects.create(
            user=make_user("jane").referee, competition=self.old.competition
        )

    def apply(self, name, start, location=None, info="", **kwargs):
        event = make_event(name, start=start, location=location)
        competition = make_competition(event, self.user.referee, info=info)
        return Application.objects.create(
            user=self.user.referee, competition=competition, **kwargs
        )

    def found(self, **params):
        response = self.client.get(reverse("application-create-list"), params)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return [a["id"] for a in response.data["results"]]

    def test_without_criteria_finds_all(self):
        self.assertEqual(self.found(), [self.recent.pk, self.lake.pk, self.old.pk])

    def test_between_dates_including_them(self):
        self.assertEqual(
            self.found(start_after="2015-03-01", start_before="2018-06-01"),
            [self.lake.pk, self.old.pk],
        )
        self.assertEqual(
            self.found(start_after="2015-03-02"), [self.recent.pk, self.lake.pk]
        )
        self.assertEqual(self.found(start_before="2015-12-31"), [self.old.pk])

    def test_at_a_location_by_any_of_its_fields(self):
        for term in ["omnisport", "LAKE", "rue du lac", "1007 lausanne"]:
            with self.subTest(term=term):
                self.assertEqual(self.found(location=term), [self.lake.pk])
        self.assertEqual(self.found(location="Bern"), [self.recent.pk, self.old.pk])
        self.assertEqual(self.found(location="Geneva"), [])

    def test_with_one_of_several_statuses(self):
        response = self.client.get(
            reverse("application-create-list"),
            {"status": [Application.Status.DECLINED, Application.Status.INVITED]},
        )
        self.assertEqual(
            [a["id"] for a in response.data["results"]],
            [self.recent.pk, self.lake.pk],
        )

    def test_free_text_anywhere(self):
        cases = {
            "swiss open": [self.recent.pk, self.old.pk],
            "kumite": [self.old.pk],
            "train": [self.lake.pk],
            "lausanne": [self.lake.pk],
            "national": [self.recent.pk, self.lake.pk, self.old.pk],
            "swiss lake": [],
        }
        for term, expected in cases.items():
            with self.subTest(term=term):
                self.assertEqual(self.found(search=term), expected)

    def test_all_criteria_together(self):
        self.assertEqual(
            self.found(
                start_after="2010-01-01",
                start_before="2020-01-01",
                location="bern",
                status=Application.Status.PARTICIPATED,
                search="swiss",
            ),
            [self.old.pk],
        )
        self.assertEqual(self.found(start_after="2020-01-01", search="kumite"), [])

    def test_rejects_invalid_criteria(self):
        url = reverse("application-create-list")
        cases = [
            ({"start_after": "yesterday"}, "start_after"),
            (
                {"start_after": "2020-01-01", "start_before": "2019-01-01"},
                "start_before",
            ),
            ({"status": "7"}, "status"),
            ({"status": "invited"}, "status"),
        ]
        for params, field in cases:
            with self.subTest(params=params):
                response = self.client.get(url, params)
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, response.data)


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

    def test_list_hides_internal_note(self):
        regional = RefereeLicense.objects.get(name="Regional")
        Examination.create(
            self.user,
            license=regional,
            date=date(2024, 5, 1),
            note_internal="For the committee only",
            note_external="Well done",
        )

        response = self.client.get(reverse("examinations-user"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        exam = response.data[0]
        self.assertNotIn("note_internal", exam)
        self.assertNotIn("For the committee only", str(response.content))
        self.assertEqual(exam["note_external"], "Well done")


class TestInvitorAccess(AuthenticatedTestCase):
    """The invitor of a competition sees the full profile of invited referees."""

    def setUp(self):
        super().setUp()
        self.competition = make_competition(make_event(), self.user.referee)
        self.jane = make_user("jane", email="jane@example.com")
        self.jane.referee.iban = "CH00 0000 0000 0000 0000 0"
        self.jane.referee.address = Address.objects.create(
            street="Home Street", city="Thun"
        )
        self.jane.referee.save()
        self.application = Application.objects.create(
            user=self.jane.referee, competition=self.competition
        )

    def invite(self, *applications, sent=True):
        invitation = Invitation.objects.create(
            competition=self.competition,
            subject="Invitation",
            sent=timezone.now() if sent else None,
        )
        invitation.invited.add(*applications)
        return invitation

    def full_profile(self):
        return self.client.get(reverse("user", args=[self.jane.pk]))

    def test_invitor_sees_full_profile_of_invited(self):
        self.invite(self.application)
        response = self.full_profile()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "jane@example.com")
        self.assertEqual(response.data["referee"]["iban"], "CH00 0000 0000 0000 0000 0")
        address = reverse("address-detail", args=[self.jane.referee.address_id])
        self.assertEqual(self.client.get(address).status_code, status.HTTP_200_OK)

    def test_invitor_may_not_change_profile(self):
        self.invite(self.application)
        for url in (f"/api/user/{self.jane.pk}/", f"/api/user/{self.jane.pk}/update/"):
            with self.subTest(url=url):
                response = self.client.patch(url, {"first_name": "X"}, format="json")
                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        address = reverse("address-detail", args=[self.jane.referee.address_id])
        response = self.client.patch(address, {"street": "X"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_applicant_not_invited(self):
        self.assertEqual(self.full_profile().status_code, status.HTTP_404_NOT_FOUND)

    def test_draft_invitation_does_not_count(self):
        self.invite(self.application, sent=False)
        self.assertEqual(self.full_profile().status_code, status.HTTP_404_NOT_FOUND)

    def test_left_out_of_update(self):
        first = self.invite(self.application)
        update = self.invite()
        update.previous_invitation = first
        update.save()
        self.assertEqual(self.full_profile().status_code, status.HTTP_404_NOT_FOUND)

    def test_other_competition_invitor(self):
        self.invite(self.application)
        self.client.force_authenticate(make_user("other"))
        self.assertEqual(self.full_profile().status_code, status.HTTP_404_NOT_FOUND)

    def test_invited_referee_does_not_see_invitor(self):
        self.invite(self.application)
        self.client.force_authenticate(self.jane)
        response = self.client.get(reverse("user", args=[self.user.pk]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
