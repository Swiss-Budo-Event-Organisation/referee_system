from django.db import migrations

# Default referee licenses, highest first. Each license's parent is the
# next higher license in this list.
DEFAULT_LICENSES = [
    "IJF Intercontinental",
    "IJF Continental",
    "National A",
    "National B",
    "Regional",
]


def create_default_licenses(apps, schema_editor):
    RefereeLicense = apps.get_model("referee", "RefereeLicense")
    db_alias = schema_editor.connection.alias

    # Only seed an empty database; never touch licenses that already exist.
    if RefereeLicense.objects.using(db_alias).exists():
        return

    parent = None
    for name in DEFAULT_LICENSES:
        parent = RefereeLicense.objects.using(db_alias).create(name=name, parent=parent)


def remove_default_licenses(apps, schema_editor):
    RefereeLicense = apps.get_model("referee", "RefereeLicense")
    db_alias = schema_editor.connection.alias
    # Delete lowest first; licenses referenced by examinations are protected
    # and are kept.
    for name in reversed(DEFAULT_LICENSES):
        license = RefereeLicense.objects.using(db_alias).filter(name=name).first()
        if license is not None and not license.exams.exists():
            license.delete()


class Migration(migrations.Migration):
    dependencies = [
        ("referee", "0005_alter_referee_mobile_alter_referee_phone"),
    ]

    operations = [
        migrations.RunPython(create_default_licenses, remove_default_licenses),
    ]
