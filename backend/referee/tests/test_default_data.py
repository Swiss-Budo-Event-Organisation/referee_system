from importlib import import_module
from itertools import pairwise
from types import SimpleNamespace

from django.apps import apps as global_apps
from django.db import connection
from django.test import TestCase

from referee.models import RefereeLicense

licenses_migration = import_module("referee.migrations.0006_default_referee_licenses")


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
