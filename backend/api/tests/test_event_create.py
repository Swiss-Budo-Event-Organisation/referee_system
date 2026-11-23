from datetime import timedelta

from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from api.tests.helpers import make_location
from api.tests.helpers import make_user
from competition.models import Competition
from competition.models import CompetitionCategory
from competition.models import Event
from helper.models import Location
from referee.models import RefereeLicense


class TestCreateEventWithCompetitions(APITestCase):
    def setUp(self):
        self.user = make_user("john", first_name="John", last_name="Doe")
        self.referee = self.user.referee
        self.client.force_authenticate(self.user)
        self.regional = RefereeLicense.objects.get(name="Regional")
        self.national_b = RefereeLicense.objects.get(name="National B")
        self.national = CompetitionCategory.objects.get(name="National")
        self.day1 = (timezone.now() + timedelta(days=30)).replace(
            hour=9, minute=0, second=0, microsecond=0
        )

    def competition(self, start, **kwargs):
        return {
            "invitor": self.referee.pk,
            "minimum_level": self.regional.pk,
            "desired_level": self.national_b.pk,
            "start": start.isoformat(),
            "duration": "08:00:00",
            "category": [self.national.pk],
            **kwargs,
        }

    def post(self, data):
        return self.client.post(reverse("event-create"), data, format="json")

    def test_creates_event_with_several_days(self):
        location = make_location()
        day2 = self.day1 + timedelta(days=1)

        response = self.post(
            {
                "name": "Swiss Open",
                "location": location.pk,
                "info": "Annual tournament",
                "competitions": [
                    self.competition(self.day1, info="Seniors", referees=12),
                    self.competition(day2, info="Juniors", competition_fields=4),
                ],
            }
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        event = Event.objects.get()
        self.assertEqual(event.name, "Swiss Open")
        self.assertEqual(event.slug, "swiss-open")
        self.assertEqual(event.creator, self.user)
        self.assertEqual(event.location, location)
        self.assertEqual(event.start, self.day1)
        self.assertEqual(event.end, day2 + timedelta(hours=8))
        self.assertEqual(
            list(event.competitions.values_list("info", flat=True)),
            ["Seniors", "Juniors"],
        )
        seniors = event.competitions.get(info="Seniors")
        self.assertEqual(list(seniors.category.all()), [self.national])
        self.assertEqual(seniors.referees, 12)
        self.assertEqual(len(response.data["competitions"]), 2)
        self.assertEqual(response.data["id"], event.pk)

    def test_creates_new_location(self):
        response = self.post(
            {
                "name": "Zurich Cup",
                "new_location": {
                    "name": "Hall Zurich",
                    "address": {
                        "street": "Hallenstrasse",
                        "house_number": "5",
                        "area_code": "8000",
                        "city": "Zurich",
                        "country": "Switzerland",
                    },
                },
                "competitions": [self.competition(self.day1)],
            }
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        location = Location.objects.get(name="Hall Zurich")
        self.assertEqual(location.address.city, "Zurich")
        self.assertEqual(Event.objects.get().location, location)

    def test_open_to_every_authenticated_user(self):
        self.client.force_authenticate(make_user("jane"))
        response = self.post(
            {
                "name": "Open Event",
                "location": make_location().pk,
                "competitions": [self.competition(self.day1)],
            }
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        response = self.post({})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_requires_a_competition(self):
        response = self.post(
            {"name": "Empty", "location": make_location().pk, "competitions": []}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("competitions", response.data)
        self.assertFalse(Event.objects.exists())

    def test_requires_exactly_one_location(self):
        new_location = {
            "name": "Hall",
            "address": {"street": "Street", "city": "Bern"},
        }
        for extra in (
            {},
            {"location": make_location().pk, "new_location": new_location},
        ):
            with self.subTest(extra=extra):
                response = self.post(
                    {
                        "name": "Event",
                        "competitions": [self.competition(self.day1)],
                        **extra,
                    }
                )
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn("location", response.data)

    def test_rejects_invalid_competition_without_saving_anything(self):
        response = self.post(
            {
                "name": "Event",
                "location": make_location().pk,
                "competitions": [
                    self.competition(self.day1),
                    self.competition(self.day1, category=[]),
                ],
            }
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        errors = response.data["competitions"]
        self.assertNotIn(0, errors)
        self.assertIn("category", errors[1])
        self.assertFalse(Event.objects.exists())
        self.assertFalse(Competition.objects.exists())

    def test_registration_must_open_before_it_closes(self):
        response = self.post(
            {
                "name": "Event",
                "location": make_location().pk,
                "competitions": [
                    self.competition(
                        self.day1,
                        application_open=(self.day1 - timedelta(days=1)).isoformat(),
                        application_close=(self.day1 - timedelta(days=2)).isoformat(),
                    )
                ],
            }
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("application_close", response.data["competitions"][0])

    def test_duration_must_be_positive(self):
        response = self.post(
            {
                "name": "Event",
                "location": make_location().pk,
                "competitions": [self.competition(self.day1, duration="00:00:00")],
            }
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("duration", response.data["competitions"][0])

    def test_registration_must_close_before_start(self):
        response = self.post(
            {
                "name": "Event",
                "location": make_location().pk,
                "competitions": [
                    self.competition(
                        self.day1,
                        application_close=(self.day1 + timedelta(hours=1)).isoformat(),
                    )
                ],
            }
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("application_close", response.data["competitions"][0])

    def test_same_name_in_same_year_gets_unique_slug(self):
        location = make_location()
        for _ in range(2):
            response = self.post(
                {
                    "name": "Swiss Open",
                    "location": location.pk,
                    "competitions": [self.competition(self.day1)],
                }
            )
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            sorted(Event.objects.values_list("slug", flat=True)),
            ["swiss-open", "swiss-open-1"],
        )


class TestFormOptions(APITestCase):
    def setUp(self):
        self.user = make_user("john", first_name="John", last_name="Doe")
        self.client.force_authenticate(self.user)

    def test_list_categories(self):
        response = self.client.get(reverse("category-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("National", [c["name"] for c in response.data])

    def test_list_referees(self):
        make_user("aaron")
        response = self.client.get(reverse("referee-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([r["name"] for r in response.data], ["aaron", "John Doe"])
        self.assertEqual(set(response.data[0]), {"id", "name"})

    def test_options_require_authentication(self):
        self.client.force_authenticate(None)
        for name in ("category-list", "referee-list"):
            with self.subTest(name=name):
                response = self.client.get(reverse(name))
                self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
