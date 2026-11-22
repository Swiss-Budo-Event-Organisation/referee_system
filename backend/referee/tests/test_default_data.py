from importlib import import_module
from itertools import pairwise
from types import SimpleNamespace

from django.apps import apps as global_apps
from django.contrib.auth.models import Group
from django.db import connection
from django.test import TestCase

from referee.models import RefereeLicense

licenses_migration = import_module("referee.migrations.0006_default_referee_licenses")
groups_migration = import_module("referee.migrations.0007_default_groups")


class TestDefaultLicenses(TestCase):
    def test_default_licenses_exist_in_order(self):
        names = licenses_migration.DEFAULT_LICENSES
        licenses = [RefereeLicense.objects.get(name=name) for name in names]

        self.assertIsNone(licenses[0].parent)
        for higher, lower in pairwise(licenses):
            self.assertEqual(lower.parent, higher)
            self.assertTrue(higher > lower)
        self.assertEqual(licenses[-1].level, len(names) - 1)

    def test_not_created_when_licenses_exist(self):
        RefereeLicense.objects.all().delete()
        RefereeLicense.objects.create(name="Custom")

        schema_editor = SimpleNamespace(connection=connection)
        licenses_migration.create_default_licenses(global_apps, schema_editor)

        self.assertEqual(
            list(RefereeLicense.objects.values_list("name", flat=True)), ["Custom"]
        )


class TestDefaultGroups(TestCase):
    def test_groups_exist(self):
        expected = [
            "International",
            "National",
            "Region 1",
            "Region 2",
            "Region 3",
            "Adapted Judo",
            "International Admin",
            "National Admin",
            "Region 1 Admin",
            "Region 2 Admin",
            "Region 3 Admin",
            "Adapted Judo Admin",
            "Region 1 Observer",
            "Region 2 Observer",
            "Region 3 Observer",
        ]
        self.assertCountEqual(groups_migration.group_names(), expected)
        for name in expected:
            self.assertTrue(Group.objects.filter(name=name).exists(), name)

    def test_admin_permissions(self):
        perms = set(
            Group.objects.get(name="Region 1 Admin").permissions.values_list(
                "codename", flat=True
            )
        )
        self.assertIn("add_event", perms)
        self.assertIn("delete_competition", perms)
        self.assertIn("view_referee", perms)
        self.assertNotIn("change_referee", perms)

    def test_observer_permissions(self):
        perms = set(
            Group.objects.get(name="Region 2 Observer").permissions.values_list(
                "codename", flat=True
            )
        )
        self.assertIn("view_competition", perms)
        self.assertNotIn("add_competition", perms)
        self.assertNotIn("change_event", perms)

    def test_member_groups_have_no_permissions(self):
        self.assertFalse(Group.objects.get(name="National").permissions.exists())
