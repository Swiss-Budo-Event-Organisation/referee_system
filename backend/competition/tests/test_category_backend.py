from django.contrib.auth.models import AnonymousUser
from django.contrib.auth.models import Group
from django.contrib.auth.models import User
from django.test import TestCase

from api.tests.helpers import make_competition
from api.tests.helpers import make_event
from api.tests.helpers import make_user
from competition import permissions
from competition.models import CompetitionCategory


def member_of(username, *group_names, **kwargs):
    user = make_user(username, **kwargs)
    user.groups.add(*Group.objects.filter(name__in=group_names))
    # A fresh instance, so no permissions are cached.
    return User.objects.get(pk=user.pk)


class TestCategoryPermissionBackend(TestCase):
    def setUp(self):
        self.region1 = CompetitionCategory.objects.get(name="Region 1")
        self.region2 = CompetitionCategory.objects.get(name="Region 2")
        invitor = make_user("invitor").referee

        # An event with a Region 1 day and a Region 2 day.
        self.event = make_event("Mixed")
        self.day_r1 = make_competition(self.event, invitor, ["Region 1"])
        self.day_r2 = make_competition(self.event, invitor, ["Region 2"])
        self.other_event = make_event("Region 2 only")
        self.other_day = make_competition(self.other_event, invitor, ["Region 2"])

        self.admin = member_of("admin", "Region 1 Admin")
        self.observer = member_of("observer", "Region 1 Observer")
        self.member = member_of("member", "Region 1")
        self.staff = member_of("staff", is_staff=True)
        self.nobody = member_of("nobody")

    def test_admin_manages_events_with_one_of_its_categories(self):
        for perm in ("change_event", "delete_event", "view_event"):
            with self.subTest(perm=perm):
                self.assertTrue(self.admin.has_perm(f"competition.{perm}", self.event))
                self.assertFalse(
                    self.admin.has_perm(f"competition.{perm}", self.other_event)
                )
        # Also the Region 2 day, as the event has a Region 1 day.
        self.assertTrue(
            self.admin.has_perm("competition.change_competition", self.day_r2)
        )
        self.assertTrue(self.admin.has_perm("competition.add_competition", self.event))
        self.assertFalse(
            self.admin.has_perm("competition.delete_competition", self.other_day)
        )

    def test_observer_may_only_view(self):
        self.assertTrue(self.observer.has_perm("competition.view_event", self.event))
        self.assertTrue(
            self.observer.has_perm("competition.view_competition", self.day_r2)
        )
        self.assertFalse(
            self.observer.has_perm("competition.view_event", self.other_event)
        )
        for perm in ("change_event", "delete_event", "change_competition"):
            with self.subTest(perm=perm):
                self.assertFalse(
                    self.observer.has_perm(f"competition.{perm}", self.event)
                )

    def test_members_and_others_get_nothing(self):
        for user in (self.member, self.nobody, AnonymousUser()):
            for perm in ("view_event", "change_event", "add_event"):
                with self.subTest(user=str(user), perm=perm):
                    self.assertFalse(user.has_perm(f"competition.{perm}", self.event))
                    self.assertFalse(user.has_perm(f"competition.{perm}"))

    def test_staff_has_every_event_permission(self):
        self.assertTrue(self.staff.has_perm("competition.add_event"))
        self.assertTrue(
            self.staff.has_perm("competition.delete_event", self.other_event)
        )
        self.assertTrue(
            self.staff.has_perm("competition.change_competition", self.other_day)
        )
        self.assertIn("competition.add_event", self.staff.get_all_permissions())
        # Only events and competitions.
        self.assertFalse(self.staff.has_perm("competition.change_application"))

    def test_inactive_users_get_nothing(self):
        for name in ("admin", "staff"):
            with self.subTest(user=name):
                user = getattr(self, name)
                user.is_active = False
                self.assertFalse(user.has_perm("competition.change_event", self.event))

    def test_admin_group_needs_the_model_permission(self):
        team = Group.objects.create(name="Kata Team")
        category = CompetitionCategory.objects.create(name="Kata", admins=team)
        self.day_r1.category.add(category)
        user = member_of("kata", "Kata Team")
        self.assertFalse(user.has_perm("competition.change_event", self.event))


class TestCreateAndApply(TestCase):
    def setUp(self):
        self.region1 = CompetitionCategory.objects.get(name="Region 1")
        self.region2 = CompetitionCategory.objects.get(name="Region 2")
        event = make_event()
        self.competition = make_competition(
            event, make_user("invitor").referee, ["Region 1"]
        )

    def test_can_create_events(self):
        self.assertTrue(permissions.can_create_events(member_of("a", "Region 1 Admin")))
        self.assertTrue(permissions.can_create_events(member_of("s", is_staff=True)))
        self.assertFalse(
            permissions.can_create_events(member_of("o", "Region 1 Observer"))
        )
        self.assertFalse(permissions.can_create_events(member_of("m", "Region 1")))
        self.assertFalse(permissions.can_create_events(AnonymousUser()))

    def test_can_create_event_needs_one_administered_category(self):
        admin = member_of("a", "Region 1 Admin")
        self.assertTrue(permissions.can_create_event(admin, [self.region1]))
        self.assertTrue(
            permissions.can_create_event(admin, [self.region1, self.region2])
        )
        self.assertFalse(permissions.can_create_event(admin, [self.region2]))
        staff = member_of("s", is_staff=True)
        self.assertTrue(permissions.can_create_event(staff, [self.region2]))

    def test_only_the_member_group_may_apply(self):
        self.assertTrue(
            permissions.can_apply(member_of("m", "Region 1"), self.competition)
        )
        for group in ("Region 1 Admin", "Region 1 Observer"):
            with self.subTest(group=group):
                user = member_of(group.replace(" ", "-"), group)
                self.assertFalse(permissions.can_apply(user, self.competition))
                # They may still see the competition.
                self.assertTrue(
                    user.has_perm("competition.view_competition", self.competition)
                )

    def test_others_may_not_apply(self):
        self.assertFalse(
            permissions.can_apply(member_of("r2", "Region 2"), self.competition)
        )
        self.assertFalse(permissions.can_apply(member_of("x"), self.competition))
        self.assertFalse(permissions.can_apply(AnonymousUser(), self.competition))
        inactive = member_of("inactive", "Region 1", is_active=False)
        self.assertFalse(permissions.can_apply(inactive, self.competition))
