from datetime import date
from datetime import timedelta

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone

from api.tests.helpers import make_competition
from api.tests.helpers import make_event
from api.tests.helpers import make_user
from competition.models import Event
from helper.models import Location
from referee.models import Examination
from referee.models import RefereeLicense


class TestCompetitionModel(TestCase):
    def setUp(self):
        self.user1 = User.objects.create_user(username="John", email="john@test.com")
        self.user2 = User.objects.create_user(username="Jane", email="jane@test.com")
        self.location = Location.objects.create(name="Test Location")
        self.event1 = Event.create(
            name="Test Event",
            location=self.location,
            start=timezone.datetime(
                2024, 12, 1, 8, 30, tzinfo=timezone.get_current_timezone()
            ),
        )
        self.event2 = Event.create(
            name="Test Event",
            location=self.location,
            start=timezone.datetime(
                2024, 12, 10, 9, 32, tzinfo=timezone.get_current_timezone()
            ),
            end=timezone.datetime(
                2024, 12, 10, 18, 32, tzinfo=timezone.get_current_timezone()
            ),
        )

    def test_competition_creation(self):
        pass


class TestRegistrationWindow(TestCase):
    def setUp(self):
        self.now = timezone.now()
        referee = make_user("john").referee
        self.competition = make_competition(
            make_event(start=self.now + timedelta(days=10)), referee
        )

    def assert_open(self, expected, **fields):
        for field, value in fields.items():
            setattr(self.competition, field, value)
        self.assertIs(self.competition.registration_open(), expected)

    def test_open_within_the_period(self):
        self.assert_open(True)

    def test_without_dates_open_until_the_start(self):
        self.assert_open(True, application_open=None, application_close=None)
        self.assertEqual(self.competition.registration_closes, self.competition.start)
        self.assert_open(False, start=self.now - timedelta(minutes=1))

    def test_without_opening_date_open_right_away(self):
        self.assert_open(True, application_open=None)

    def test_not_yet_open(self):
        self.assert_open(False, application_open=self.now + timedelta(hours=1))

    def test_closed(self):
        self.assert_open(False, application_close=self.now - timedelta(minutes=1))

    def test_registration_switched_off(self):
        self.assert_open(False, application=False)


class TestEligibility(TestCase):
    def setUp(self):
        self.referee = make_user("john").referee
        self.competition = make_competition(make_event(), self.referee)
        self.competition.minimum_level = RefereeLicense.objects.get(name="National B")

    def license(self, name, passed=True):
        Examination.create(
            self.referee,
            license=RefereeLicense.objects.get(name=name),
            date=date(2024, 5, 1),
            passed=passed,
        )

    def test_without_license(self):
        self.assertFalse(self.competition.is_eligible(self.referee))

    def test_minimum_license(self):
        self.license("National B")
        self.assertTrue(self.competition.is_eligible(self.referee))

    def test_higher_license(self):
        self.license("IJF Continental")
        self.assertTrue(self.competition.is_eligible(self.referee))

    def test_lower_license(self):
        self.license("Regional")
        self.assertFalse(self.competition.is_eligible(self.referee))

    def test_failed_exam_does_not_count(self):
        self.license("National B", passed=False)
        self.assertFalse(self.competition.is_eligible(self.referee))

    def test_no_minimum_accepts_everyone(self):
        self.competition.minimum_level = None
        self.assertTrue(self.competition.is_eligible(self.referee))

    def test_application_allowed(self):
        self.license("National A")
        self.assertTrue(self.competition.application_allowed(self.referee))
        self.assertTrue(self.competition.application_allowed())
        self.competition.application = False
        self.assertFalse(self.competition.application_allowed(self.referee))
        self.competition.application = True
        self.assertFalse(
            self.competition.application_allowed(make_user("jane").referee)
        )
