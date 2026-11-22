from datetime import date

from django.contrib.auth.models import AnonymousUser
from django.contrib.auth.models import Group
from django.test import TestCase

from api.tests.helpers import make_user
from referee import permissions
from referee.models import Examination
from referee.models import RefereeLicense


class TestExaminationPermissions(TestCase):
    def setUp(self):
        self.national_examiner = make_user("examiner")
        self.national_examiner.groups.add(Group.objects.get(name="Examiner National"))
        self.nobody = make_user("nobody")
        self.superuser = make_user("root", is_superuser=True)
        self.national_a = RefereeLicense.objects.get(name="National A")
        self.national_b = RefereeLicense.objects.get(name="National B")
        self.regional = RefereeLicense.objects.get(name="Regional")

    def test_default_examiner_groups(self):
        self.assertEqual(self.national_a.examiners.name, "Examiner National")
        self.assertEqual(self.regional.examiners.name, "Examiner Regional")
        self.assertEqual(
            RefereeLicense.objects.get(name="IJF Continental").examiners.name,
            "Examiner International",
        )
        perms = set(
            Group.objects.get(name="Examiner National").permissions.values_list(
                "codename", flat=True
            )
        )
        self.assertEqual(perms, {"add_examination", "view_examination"})

    def test_license_admin_permissions(self):
        perms = set(
            Group.objects.get(name="National Admin").permissions.values_list(
                "codename", flat=True
            )
        )
        self.assertTrue({"add_refereelicense", "change_refereelicense"} <= perms)

    def test_examinable_licenses(self):
        self.assertCountEqual(
            permissions.examinable_licenses(self.national_examiner),
            [self.national_a, self.national_b],
        )
        self.assertFalse(permissions.examinable_licenses(self.nobody).exists())
        self.assertFalse(permissions.examinable_licenses(AnonymousUser()).exists())
        self.assertEqual(
            permissions.examinable_licenses(self.superuser).count(),
            RefereeLicense.objects.count(),
        )

    def test_can_examine(self):
        self.assertTrue(
            permissions.can_examine(self.national_examiner, self.national_b)
        )
        self.assertFalse(permissions.can_examine(self.national_examiner, self.regional))
        self.assertTrue(permissions.can_examine(self.superuser, self.regional))

    def test_inactive_examiner(self):
        self.national_examiner.is_active = False
        self.national_examiner.save()
        self.assertFalse(
            permissions.can_examine(self.national_examiner, self.national_a)
        )

    def test_examinations_of_examiner(self):
        exam = Examination.create(
            self.nobody, license=self.national_b, date=date(2024, 1, 1)
        )
        Examination.create(self.nobody, license=self.regional, date=date(2024, 1, 2))
        self.assertEqual(
            list(permissions.examinations_of_examiner(self.national_examiner)), [exam]
        )
