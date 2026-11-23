from django.contrib.auth.models import AnonymousUser
from django.contrib.auth.models import Group
from django.test import TestCase

from api.tests.helpers import make_competition
from api.tests.helpers import make_event
from api.tests.helpers import make_user
from competition import permissions
from competition.models import Application
from competition.models import CompetitionCategory


class TestCompetitionPermissions(TestCase):
    def setUp(self):
        self.region1 = CompetitionCategory.objects.get(name="Region 1")
        self.region2 = CompetitionCategory.objects.get(name="Region 2")
        self.national = CompetitionCategory.objects.get(name="National")

        self.admin = make_user("admin")
        self.admin.groups.add(Group.objects.get(name="Region 1 Admin"))
        self.observer = make_user("observer")
        self.observer.groups.add(Group.objects.get(name="Region 1 Observer"))
        self.nobody = make_user("nobody")
        self.superuser = make_user("root", is_superuser=True)
        self.inactive = make_user("inactive", is_active=False)
        self.inactive.groups.add(Group.objects.get(name="Region 1 Admin"))

        event = make_event()
        self.comp_r1 = make_competition(event, self.nobody.referee, ["Region 1"])
        self.comp_r2 = make_competition(event, self.nobody.referee, ["Region 2"])
        self.app_r1 = Application.objects.create(
            user=self.nobody.referee, competition=self.comp_r1
        )
        self.app_r2 = Application.objects.create(
            user=self.nobody.referee, competition=self.comp_r2
        )

    def test_default_categories_have_groups(self):
        self.assertEqual(self.region1.admins.name, "Region 1 Admin")
        self.assertEqual(self.region1.observers.name, "Region 1 Observer")
        self.assertEqual(self.national.admins.name, "National Admin")
        self.assertEqual(self.national.observers.name, "National Observer")

    def test_administered_categories(self):
        self.assertEqual(
            list(permissions.administered_categories(self.admin)), [self.region1]
        )
        self.assertFalse(permissions.administered_categories(self.observer).exists())
        self.assertFalse(permissions.administered_categories(self.nobody).exists())
        self.assertFalse(permissions.administered_categories(self.inactive).exists())
        self.assertFalse(permissions.administered_categories(AnonymousUser()).exists())
        self.assertEqual(
            permissions.administered_categories(self.superuser).count(),
            CompetitionCategory.objects.count(),
        )

    def test_observed_categories_include_administered(self):
        self.assertEqual(
            list(permissions.observed_categories(self.admin)), [self.region1]
        )
        self.assertEqual(
            list(permissions.observed_categories(self.observer)), [self.region1]
        )
        self.assertFalse(permissions.observed_categories(self.nobody).exists())

    def test_competitions(self):
        self.assertTrue(permissions.can_manage_competition(self.admin, self.comp_r1))
        self.assertFalse(permissions.can_manage_competition(self.admin, self.comp_r2))
        self.assertFalse(
            permissions.can_manage_competition(self.observer, self.comp_r1)
        )
        self.assertTrue(
            permissions.can_observe_competition(self.observer, self.comp_r1)
        )
        self.assertTrue(permissions.can_observe_competition(self.admin, self.comp_r1))
        self.assertFalse(
            permissions.can_observe_competition(self.observer, self.comp_r2)
        )
        self.assertTrue(
            permissions.can_manage_competition(self.superuser, self.comp_r2)
        )
        self.assertFalse(
            permissions.can_observe_competition(AnonymousUser(), self.comp_r1)
        )

    def test_competition_in_several_categories_is_listed_once(self):
        self.comp_r1.category.add(self.region2)
        self.admin.groups.add(Group.objects.get(name="Region 2 Admin"))
        self.assertEqual(permissions.managed_competitions(self.admin).count(), 2)

    def test_applications(self):
        self.assertEqual(
            list(permissions.managed_applications(self.admin)), [self.app_r1]
        )
        self.assertEqual(
            list(permissions.observed_applications(self.observer)), [self.app_r1]
        )
        self.assertFalse(permissions.managed_applications(self.observer).exists())
        self.assertEqual(permissions.managed_applications(self.superuser).count(), 2)

    def test_can_assign_categories(self):
        assign = permissions.can_assign_categories
        self.assertTrue(assign(self.admin, [self.region1]))
        self.assertFalse(assign(self.admin, [self.region2]))
        self.assertFalse(assign(self.admin, []))
        # Untouched categories are fine, changed ones must be administered.
        self.assertTrue(
            assign(self.admin, [self.region1, self.region2], current=[self.region2])
        )
        self.assertFalse(assign(self.admin, [self.region1], current=[self.region2]))
        self.assertTrue(assign(self.superuser, [self.region2], current=[self.region1]))

    def test_category_admins_cannot_edit_categories(self):
        group = Group.objects.get(name="Region 1 Admin")
        codenames = set(group.permissions.values_list("codename", flat=True))
        self.assertFalse(
            codenames
            & {
                "add_competitioncategory",
                "change_competitioncategory",
                "delete_competitioncategory",
            }
        )
