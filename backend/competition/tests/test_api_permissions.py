from datetime import date
from datetime import timedelta

from django.contrib.auth.models import Group
from django.contrib.auth.models import User
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from competition.models import Application
from competition.models import Competition
from competition.models import CompetitionCategory
from competition.models import Event
from helper.models import Location
from referee.models import Examination
from referee.models import RefereeLicense


def _user(name, *groups):
    user = User.objects.create_user(username=name)
    user.groups.add(*Group.objects.filter(name__in=groups))
    return user


class TestDefaultCategoriesAndRoles(APITestCase):
    def test_categories_linked_to_groups(self):
        region1 = CompetitionCategory.objects.get(name="Region 1")
        self.assertEqual(region1.admins.name, "Region 1 Admin")
        self.assertEqual(region1.observers.name, "Region 1 Observer")
        national = CompetitionCategory.objects.get(name="National")
        self.assertEqual(national.admins.name, "National Admin")
        self.assertIsNone(national.observers)
        self.assertTrue(CompetitionCategory.objects.filter(name="Adapted Judo"))
        self.assertTrue(CompetitionCategory.objects.filter(name="International"))

    def test_examiner_groups_linked_to_licenses(self):
        expected = {
            "IJF Intercontinental": "Examiner International",
            "IJF Continental": "Examiner International",
            "National A": "Examiner National",
            "National B": "Examiner National",
            "Regional": "Examiner Regional",
        }
        for license, group in expected.items():
            self.assertEqual(
                RefereeLicense.objects.get(name=license).examiners.name, group
            )

    def test_only_national_admin_may_edit_licenses(self):
        for codename in ["add_refereelicense", "change_refereelicense"]:
            groups = Group.objects.filter(permissions__codename=codename)
            self.assertEqual(
                list(groups.values_list("name", flat=True)), ["National Admin"]
            )

    def test_admins_cannot_edit_categories(self):
        self.assertFalse(
            Group.objects.filter(
                permissions__codename__in=[
                    "add_competitioncategory",
                    "change_competitioncategory",
                    "delete_competitioncategory",
                ]
            ).exists()
        )


class PermissionTestCase(APITestCase):
    def setUp(self):
        self.region1 = CompetitionCategory.objects.get(name="Region 1")
        self.region2 = CompetitionCategory.objects.get(name="Region 2")
        self.regional = RefereeLicense.objects.get(name="Regional")
        self.national_a = RefereeLicense.objects.get(name="National A")

        self.admin1 = _user("admin1", "Region 1 Admin")
        self.observer1 = _user("observer1", "Region 1 Observer")
        self.national_admin = _user("national", "National Admin")
        self.referee = _user("referee", "Region 1")
        self.other = _user("other")
        self.examiner = _user("examiner", "Examiner Regional")

        location = Location.objects.create(name="Hall")
        self.event = Event.create(
            name="Cup", location=location, start=timezone.now() + timedelta(days=30)
        )
        self.comp1 = self._competition(self.region1)
        self.comp2 = self._competition(self.region2)

    def _competition(self, category):
        competition = Competition.objects.create(
            event=self.event,
            invitor=self.admin1.referee,
            minimum_level=self.regional,
            desired_level=self.regional,
            start=self.event.start,
            duration=timedelta(hours=8),
        )
        competition.category.add(category)
        return competition


class TestCompetitionApi(PermissionTestCase):
    def test_admin_changes_only_own_category(self):
        self.client.force_authenticate(self.admin1)
        url = reverse("competition-detail", args=[self.comp1.pk])
        self.assertEqual(self.client.patch(url, {"info": "x"}).status_code, 200)
        url = reverse("competition-detail", args=[self.comp2.pk])
        self.assertEqual(self.client.patch(url, {"info": "x"}).status_code, 403)

    def test_admin_cannot_move_competition_to_other_category(self):
        self.client.force_authenticate(self.admin1)
        url = reverse("competition-detail", args=[self.comp1.pk])
        response = self.client.patch(url, {"category": [self.region2.pk]})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_creates_only_in_own_category(self):
        self.client.force_authenticate(self.admin1)
        data = {
            "event": self.event.pk,
            "invitor": self.admin1.referee.pk,
            "minimum_level": self.regional.pk,
            "desired_level": self.regional.pk,
            "start": self.event.start.isoformat(),
            "duration": "08:00:00",
            "category": [self.region1.pk],
        }
        url = reverse("competition-create")
        self.assertEqual(self.client.post(url, data).status_code, 201)
        data["category"] = [self.region2.pk]
        self.assertEqual(self.client.post(url, data).status_code, 403)

    def test_observer_cannot_change(self):
        self.client.force_authenticate(self.observer1)
        url = reverse("competition-detail", args=[self.comp1.pk])
        self.assertEqual(self.client.patch(url, {"info": "x"}).status_code, 403)

    def test_observer_sees_applications_of_own_category_only(self):
        Application.objects.create(user=self.referee.referee, competition=self.comp1)
        self.client.force_authenticate(self.observer1)

        url = reverse("competition-applications", args=[self.comp1.pk])
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

        url = reverse("competition-applications", args=[self.comp2.pk])
        self.assertEqual(self.client.get(url).status_code, 404)

    def test_regular_user_cannot_see_applications_of_competition(self):
        self.client.force_authenticate(self.referee)
        url = reverse("competition-applications", args=[self.comp1.pk])
        self.assertEqual(self.client.get(url).status_code, 404)


class TestApplicationApi(PermissionTestCase):
    def test_user_creates_and_changes_own_application(self):
        Examination.create(self.other, license=self.regional, date=date(2024, 5, 1))
        self.client.force_authenticate(self.other)
        response = self.client.post(
            reverse("application-create-list"),
            {"competition": self.comp2.pk, "user": self.other.referee.pk},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        url = reverse("application-detail", args=[response.data["id"]])
        response = self.client.patch(
            url,
            {
                "accommodation_remark": "Vegetarian",
                "status": Application.Status.SELECTED,
            },
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        application = Application.objects.get(pk=response.data["id"])
        self.assertEqual(application.accommodation_remark, "Vegetarian")
        # Status is set by competition admins only.
        self.assertEqual(application.status, Application.Status.APPLIED)

    def test_user_cannot_move_application(self):
        application = Application.objects.create(
            user=self.other.referee, competition=self.comp1
        )
        self.client.force_authenticate(self.other)
        url = reverse("application-detail", args=[application.pk])
        response = self.client.patch(url, {"competition": self.comp2.pk})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_cannot_change_others_application(self):
        application = Application.objects.create(
            user=self.referee.referee, competition=self.comp1
        )
        self.client.force_authenticate(self.other)
        url = reverse("application-detail", args=[application.pk])
        response = self.client.patch(url, {"accommodation_remark": "x"})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_admin_manages_applications_of_own_category(self):
        app1 = Application.objects.create(
            user=self.referee.referee, competition=self.comp1
        )
        app2 = Application.objects.create(
            user=self.referee.referee, competition=self.comp2
        )
        self.client.force_authenticate(self.admin1)
        data = {"status": Application.Status.SELECTED}

        url = reverse("application-manage", args=[app1.pk])
        self.assertEqual(self.client.patch(url, data).status_code, 200)
        app1.refresh_from_db()
        self.assertEqual(app1.status, Application.Status.SELECTED)

        url = reverse("application-manage", args=[app2.pk])
        self.assertEqual(self.client.patch(url, data).status_code, 404)

    def test_observer_cannot_manage_applications(self):
        application = Application.objects.create(
            user=self.referee.referee, competition=self.comp1
        )
        self.client.force_authenticate(self.observer1)
        url = reverse("application-manage", args=[application.pk])
        response = self.client.patch(url, {"status": Application.Status.SELECTED})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class TestLicenseAndExaminationApi(PermissionTestCase):
    def test_only_national_admin_creates_licenses(self):
        url = reverse("license-list")
        self.client.force_authenticate(self.admin1)
        self.assertEqual(self.client.post(url, {"name": "New"}).status_code, 403)
        self.client.force_authenticate(self.national_admin)
        self.assertEqual(self.client.post(url, {"name": "New"}).status_code, 201)

    def test_only_national_admin_changes_licenses(self):
        url = reverse("license-detail", args=[self.regional.pk])
        self.client.force_authenticate(self.admin1)
        self.assertEqual(self.client.patch(url, {"name": "X"}).status_code, 403)
        self.client.force_authenticate(self.national_admin)
        self.assertEqual(self.client.patch(url, {"name": "X"}).status_code, 200)

    def test_everyone_lists_licenses(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(reverse("license-list")).status_code, 200)

    def test_examiner_creates_exams_for_own_licenses_only(self):
        self.client.force_authenticate(self.examiner)
        url = reverse("examination-create")
        data = {
            "candidate": self.referee.referee.pk,
            "license": self.regional.pk,
            "date": "2026-11-01",
        }
        self.assertEqual(self.client.post(url, data).status_code, 201)
        data["license"] = self.national_a.pk
        self.assertEqual(self.client.post(url, data).status_code, 403)
        self.assertEqual(Examination.objects.count(), 1)

    def test_non_examiner_cannot_create_exams(self):
        self.client.force_authenticate(self.admin1)
        data = {
            "candidate": self.referee.referee.pk,
            "license": self.regional.pk,
            "date": "2026-11-01",
        }
        response = self.client.post(reverse("examination-create"), data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
