from datetime import timedelta

from django.contrib.auth.models import Group
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from api.tests.helpers import make_competition
from api.tests.helpers import make_event
from api.tests.helpers import make_user
from competition.models import Application
from competition.models import Competition
from competition.models import CompetitionCategory


def member_of(username, *group_names, **kwargs):
    user = make_user(username, **kwargs)
    user.groups.add(*Group.objects.filter(name__in=group_names))
    return user


class EventEditTestCase(APITestCase):
    def setUp(self):
        self.region1 = CompetitionCategory.objects.get(name="Region 1")
        self.region2 = CompetitionCategory.objects.get(name="Region 2")
        self.admin = member_of("admin", "Region 1 Admin")
        self.client.force_authenticate(self.admin)
        self.event = make_event("Swiss Open")
        self.day1 = make_competition(self.event, self.admin.referee, ["Region 1"])
        self.day2 = make_competition(
            self.event,
            self.admin.referee,
            ["Region 1"],
            start=self.day1.start + timedelta(days=1),
        )

    def url(self, event=None):
        return reverse("event-edit", args=[(event or self.event).pk])

    def load(self):
        response = self.client.get(self.url())
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        return response.data

    def save(self, data, event=None):
        return self.client.put(self.url(event), data, format="json")

    def form_data(self):
        """The event as loaded by the edit form, ready to be sent back."""
        data = self.load()
        for competition in data["competitions"]:
            for field in ("event", "created", "modified"):
                competition.pop(field)
        return {
            "name": data["name"],
            "info": data["info"],
            "location": data["location"],
            "competitions": data["competitions"],
        }


class TestEditEvent(EventEditTestCase):
    def test_loads_event_with_its_days(self):
        data = self.load()
        self.assertEqual(data["name"], "Swiss Open")
        self.assertEqual(data["location"], self.event.location.pk)
        self.assertEqual(
            [c["id"] for c in data["competitions"]], [self.day1.pk, self.day2.pk]
        )

    def test_updates_adds_and_removes_days(self):
        data = self.form_data()
        data["name"] = "Swiss Open 2"
        data["competitions"][0]["info"] = "Seniors"
        new_day = {**data["competitions"][1], "id": None, "info": "Juniors"}
        new_day["start"] = (self.day2.start + timedelta(days=1)).isoformat()
        data["competitions"] = [data["competitions"][0], new_day]

        response = self.save(data)

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.event.refresh_from_db()
        self.assertEqual(self.event.name, "Swiss Open 2")
        self.assertEqual(self.event.slug, "swiss-open")
        days = list(self.event.competitions.all())
        self.assertEqual([d.info for d in days], ["Seniors", "Juniors"])
        self.assertEqual(days[0].pk, self.day1.pk)
        self.assertFalse(Competition.objects.filter(pk=self.day2.pk).exists())
        self.assertEqual(self.event.start, self.day1.start)
        self.assertEqual(self.event.end, days[1].start + days[1].duration)

    def test_moves_to_a_new_location(self):
        data = self.form_data()
        data.pop("location")
        data["new_location"] = {
            "name": "New Hall",
            "address": {"street": "Street", "city": "Bern"},
        }
        response = self.save(data)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.event.refresh_from_db()
        self.assertEqual(self.event.location.name, "New Hall")

    def test_cannot_remove_a_day_with_applications(self):
        Application.objects.create(user=make_user("ref").referee, competition=self.day2)
        data = self.form_data()
        data["competitions"] = data["competitions"][:1]

        response = self.save(data)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("competitions", response.data)
        self.assertTrue(Competition.objects.filter(pk=self.day2.pk).exists())

    def test_rejects_days_of_other_events(self):
        other = make_competition(make_event("Other"), self.admin.referee, ["Region 1"])
        data = self.form_data()
        data["competitions"][1]["id"] = other.pk
        response = self.save(data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Competition.objects.get(pk=other.pk).event.name, "Other")

    def test_admin_must_keep_one_of_the_categories(self):
        data = self.form_data()
        for competition in data["competitions"]:
            competition["category"] = [self.region2.pk]
        response = self.save(data)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(list(self.day1.category.all()), [self.region1])

    def test_staff_may_edit_any_event(self):
        data = self.form_data()
        self.client.force_authenticate(make_user("staff", is_staff=True))
        data["name"] = "By staff"
        for competition in data["competitions"]:
            competition["category"] = [self.region2.pk]
        response = self.save(data)
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

    def test_others_may_not_load_or_edit(self):
        data = self.form_data()
        users = [
            member_of("r2", "Region 2 Admin"),
            member_of("observer", "Region 1 Observer"),
            member_of("member", "Region 1"),
        ]
        for user in users:
            with self.subTest(user=user.username):
                self.client.force_authenticate(user)
                self.assertEqual(self.client.get(self.url()).status_code, 403)
                self.assertEqual(self.save(data).status_code, 403)

    def test_patch_is_not_allowed(self):
        response = self.client.patch(self.url(), {"name": "x"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_detail_tells_whether_the_user_may_edit(self):
        url = reverse("event-detail", args=[self.event.pk])
        self.assertTrue(self.client.get(url).data["can_edit"])
        self.client.force_authenticate(member_of("observer", "Region 1 Observer"))
        self.assertFalse(self.client.get(url).data["can_edit"])


class TestEventApplications(EventEditTestCase):
    def url(self, event=None):
        return reverse("event-applications", args=[(event or self.event).pk])

    def test_lists_applications_of_all_days(self):
        jane = make_user("jane", first_name="Jane", last_name="Roe")
        Application.objects.create(user=jane.referee, competition=self.day2)
        Application.objects.create(user=self.admin.referee, competition=self.day1)
        other = make_competition(make_event("Other"), self.admin.referee)
        Application.objects.create(user=jane.referee, competition=other)

        response = self.client.get(self.url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [(a["competition"], a["name"]) for a in response.data],
            [(self.day1.pk, "admin"), (self.day2.pk, "Jane Roe")],
        )
        self.assertEqual(response.data[0]["status_display"], "Applied")

    def test_adds_an_application_without_any_checks(self):
        # No license, no member group and registration closed.
        self.day1.application = False
        self.day1.save()
        jane = make_user("jane")

        response = self.client.post(
            self.url(),
            {"user": jane.referee.pk, "competition": self.day1.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        application = Application.objects.get()
        self.assertEqual(application.user, jane.referee)
        self.assertEqual(application.status, Application.Status.APPLIED)

    def test_only_one_application_per_referee_and_day(self):
        jane = make_user("jane")
        data = {"user": jane.referee.pk, "competition": self.day1.pk}
        self.assertEqual(self.client.post(self.url(), data).status_code, 201)
        self.assertEqual(self.client.post(self.url(), data).status_code, 400)

    def test_competition_must_belong_to_the_event(self):
        other = make_competition(make_event("Other"), self.admin.referee)
        response = self.client.post(
            self.url(), {"user": self.admin.referee.pk, "competition": other.pk}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("competition", response.data)

    def test_only_for_those_who_may_edit(self):
        for user in (
            member_of("observer", "Region 1 Observer"),
            member_of("r2", "Region 2 Admin"),
        ):
            with self.subTest(user=user.username):
                self.client.force_authenticate(user)
                self.assertEqual(self.client.get(self.url()).status_code, 403)
                response = self.client.post(
                    self.url(),
                    {"user": user.referee.pk, "competition": self.day1.pk},
                )
                self.assertEqual(response.status_code, 403)
        self.assertFalse(Application.objects.exists())

    def test_unknown_event(self):
        response = self.client.get(reverse("event-applications", args=[9999]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class TestRemoveEventApplications(EventEditTestCase):
    def setUp(self):
        super().setUp()
        self.application = Application.objects.create(
            user=make_user("jane").referee, competition=self.day1
        )

    def url(self, application=None, event=None):
        return reverse(
            "event-application-detail",
            args=[(event or self.event).pk, (application or self.application).pk],
        )

    def test_admin_cancels_or_declines(self):
        for value in (Application.Status.CANCLED, Application.Status.DECLINED):
            with self.subTest(status=value.label):
                response = self.client.patch(self.url(), {"status": value})
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response.data["status_display"], value.label)
                self.application.refresh_from_db()
                self.assertEqual(self.application.status, value)

    def test_no_other_status(self):
        for value in (Application.Status.SELECTED, Application.Status.APPLIED):
            with self.subTest(status=value.label):
                response = self.client.patch(self.url(), {"status": value})
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, Application.Status.APPLIED)

    def test_admin_may_not_delete(self):
        response = self.client.delete(self.url())
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Application.objects.filter(pk=self.application.pk).exists())

    def test_staff_deletes_or_declines(self):
        self.client.force_authenticate(make_user("staff", is_staff=True))
        response = self.client.patch(
            self.url(), {"status": Application.Status.DECLINED}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response = self.client.delete(self.url())
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Application.objects.exists())

    def test_others_may_not_change(self):
        for user in (
            member_of("observer", "Region 1 Observer"),
            member_of("r2", "Region 2 Admin"),
        ):
            with self.subTest(user=user.username):
                self.client.force_authenticate(user)
                response = self.client.patch(
                    self.url(), {"status": Application.Status.CANCLED}
                )
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
                self.assertEqual(self.client.delete(self.url()).status_code, 403)
        self.application.refresh_from_db()
        self.assertEqual(self.application.status, Application.Status.APPLIED)

    def test_application_must_belong_to_the_event(self):
        other_event = make_event("Other")
        other_day = make_competition(other_event, self.admin.referee, ["Region 1"])
        other = Application.objects.create(
            user=make_user("joe").referee, competition=other_day
        )
        response = self.client.patch(
            self.url(application=other), {"status": Application.Status.CANCLED}
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_only_patch_and_delete(self):
        response = self.client.put(self.url(), {"status": Application.Status.CANCLED})
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertEqual(self.client.get(self.url()).status_code, 405)
