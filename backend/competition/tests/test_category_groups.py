from django.contrib.auth.models import Group
from django.test import TestCase

from competition.models import CompetitionCategory


class TestCategoryGroups(TestCase):
    def test_new_category_gets_three_groups(self):
        category = CompetitionCategory.objects.create(name="Kata")

        self.assertTrue(Group.objects.filter(name="Kata").exists())
        category.refresh_from_db()
        self.assertEqual(category.admins.name, "Kata Admin")
        self.assertEqual(category.observers.name, "Kata Observer")

    def test_admin_and_observer_permissions(self):
        category = CompetitionCategory.objects.create(name="Kata")

        admin = set(category.admins.permissions.values_list("codename", flat=True))
        observer = set(
            category.observers.permissions.values_list("codename", flat=True)
        )
        self.assertTrue(
            {"add_competition", "change_competition", "view_referee"} <= admin
        )
        self.assertNotIn("change_competitioncategory", admin)
        self.assertNotIn("change_referee", admin)
        self.assertIn("view_competition", observer)
        self.assertFalse(any(not c.startswith("view_") for c in observer))
        member = Group.objects.get(name="Kata")
        self.assertFalse(member.permissions.exists())

    def test_keeps_groups_given_on_creation(self):
        admins = Group.objects.create(name="Kata Team")
        category = CompetitionCategory.objects.create(name="Kata", admins=admins)

        category.refresh_from_db()
        self.assertEqual(category.admins, admins)
        self.assertEqual(category.observers.name, "Kata Observer")
        self.assertFalse(Group.objects.filter(name="Kata Admin").exists())

    def test_renaming_renames_groups(self):
        category = CompetitionCategory.objects.create(name="Kata")
        admins_pk = category.admins_id
        category.name = "Kata Open"
        category.save()

        category.refresh_from_db()
        self.assertEqual(category.admins.name, "Kata Open Admin")
        self.assertEqual(category.admins_id, admins_pk)
        self.assertEqual(category.observers.name, "Kata Open Observer")
        self.assertTrue(Group.objects.filter(name="Kata Open").exists())
        self.assertFalse(
            Group.objects.filter(
                name__in=["Kata", "Kata Admin", "Kata Observer"]
            ).exists()
        )

    def test_saving_without_rename_keeps_groups(self):
        category = CompetitionCategory.objects.create(name="Kata")
        category.save()

        self.assertEqual(Group.objects.filter(name__startswith="Kata").count(), 3)

    def test_renaming_keeps_custom_group_names(self):
        team = Group.objects.create(name="Kata Team")
        category = CompetitionCategory.objects.create(name="Kata", admins=team)
        category.name = "Kata Open"
        category.save()

        team.refresh_from_db()
        self.assertEqual(team.name, "Kata Team")
        category.refresh_from_db()
        self.assertEqual(category.observers.name, "Kata Open Observer")

    def test_renaming_skips_names_already_taken(self):
        category = CompetitionCategory.objects.create(name="Kata")
        taken = Group.objects.create(name="Kata Open Admin")
        category.name = "Kata Open"
        category.save()

        category.refresh_from_db()
        self.assertEqual(category.admins.name, "Kata Admin")
        self.assertNotEqual(category.admins, taken)
        self.assertEqual(category.observers.name, "Kata Open Observer")

    def test_default_categories_have_all_groups(self):
        names = [
            "International",
            "National",
            "Region 1",
            "Region 2",
            "Region 3",
            "Adapted Judo",
        ]
        for name in names:
            with self.subTest(category=name):
                category = CompetitionCategory.objects.get(name=name)
                self.assertTrue(Group.objects.filter(name=name).exists())
                self.assertEqual(category.admins.name, f"{name} Admin")
                self.assertEqual(category.observers.name, f"{name} Observer")
                admin = category.admins.permissions.values_list("codename", flat=True)
                self.assertIn("delete_competition", admin)
                self.assertNotIn("change_competitioncategory", admin)
                self.assertTrue(
                    category.observers.permissions.filter(
                        codename="view_competition"
                    ).exists()
                )
