from django.contrib.auth.management import create_permissions
from django.db import migrations

from competition.groups import create_category_groups
from competition.groups import group_names

# Default competition categories. Each gets a member, an admin and an
# observer group (see competition.groups).
CATEGORIES = [
    "International",
    "National",
    "Region 1",
    "Region 2",
    "Region 3",
    "Adapted Judo",
]

# Examiner groups and the licenses they may record examinations for.
EXAMINERS = {
    "Examiner International": ["IJF Intercontinental", "IJF Continental"],
    "Examiner National": ["National A", "National B"],
    "Examiner Regional": ["Regional"],
}
EXAMINER_PERMISSIONS = ["add_examination", "view_examination"]

# The admins of this category may also add and change licenses.
LICENSE_ADMIN_CATEGORY = "National"
LICENSE_ADMIN_PERMISSIONS = ["add_refereelicense", "change_refereelicense"]


def _perms(Permission, db_alias, codenames):
    return list(Permission.objects.using(db_alias).filter(codename__in=codenames))


def forwards(apps, schema_editor):
    db_alias = schema_editor.connection.alias

    # Permissions are normally created after all migrations ran (post_migrate);
    # make sure they exist now so they can be assigned on a fresh database.
    for app_config in apps.get_app_configs():
        app_config.models_module = True
        create_permissions(app_config, apps=apps, verbosity=0, using=db_alias)
        app_config.models_module = None

    Group = apps.get_model("auth", "Group")
    Permission = apps.get_model("auth", "Permission")
    CompetitionCategory = apps.get_model("competition", "CompetitionCategory")
    RefereeLicense = apps.get_model("referee", "RefereeLicense")
    groups = Group.objects.using(db_alias)

    # The post_save hook does not run for historical models, so create the
    # groups here, also for categories that existed before.
    for name in CATEGORIES:
        CompetitionCategory.objects.using(db_alias).get_or_create(name=name)
    for category in CompetitionCategory.objects.using(db_alias).all():
        create_category_groups(category, Group, Permission, using=db_alias)

    examiner_perms = _perms(Permission, db_alias, EXAMINER_PERMISSIONS)
    for group_name, license_names in EXAMINERS.items():
        group, _ = groups.get_or_create(name=group_name)
        group.permissions.add(*examiner_perms)
        RefereeLicense.objects.using(db_alias).filter(
            name__in=license_names, examiners__isnull=True
        ).update(examiners=group)

    license_admin = (
        CompetitionCategory.objects.using(db_alias)
        .get(name=LICENSE_ADMIN_CATEGORY)
        .admins
    )
    license_admin.permissions.add(
        *_perms(Permission, db_alias, LICENSE_ADMIN_PERMISSIONS)
    )


def backwards(apps, schema_editor):
    db_alias = schema_editor.connection.alias
    Group = apps.get_model("auth", "Group")
    CompetitionCategory = apps.get_model("competition", "CompetitionCategory")

    Group.objects.using(db_alias).filter(name__in=EXAMINERS.keys()).delete()
    CompetitionCategory.objects.using(db_alias).filter(
        name__in=CATEGORIES, competition__isnull=True
    ).delete()
    Group.objects.using(db_alias).filter(
        name__in=[group for name in CATEGORIES for group in group_names(name)]
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("auth", "0012_alter_user_first_name_max_length"),
        ("contenttypes", "0002_remove_content_type_name"),
        ("competition", "0005_competitioncategory_groups"),
        ("referee", "0008_refereelicense_examiners"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
