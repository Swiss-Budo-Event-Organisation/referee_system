from django.contrib.auth.management import create_permissions
from django.db import migrations


def _approve_permission(apps, schema_editor):
    db_alias = schema_editor.connection.alias
    # Permissions are normally created after all migrations ran.
    app_config = apps.get_app_config("accounts")
    app_config.models_module = True
    create_permissions(app_config, apps=apps, verbosity=0, using=db_alias)
    app_config.models_module = None
    Permission = apps.get_model("auth", "Permission")
    return Permission.objects.using(db_alias).get(
        content_type__app_label="accounts", codename="approve_account"
    )


def forwards(apps, schema_editor):
    """Staff members approved accounts so far; they keep doing so."""
    permission = _approve_permission(apps, schema_editor)
    User = apps.get_model("auth", "User")
    users = User.objects.using(schema_editor.connection.alias)
    for user in users.filter(is_staff=True):
        user.user_permissions.add(permission)


def backwards(apps, schema_editor):
    Permission = apps.get_model("auth", "Permission")
    Permission.objects.using(schema_editor.connection.alias).filter(
        content_type__app_label="accounts", codename="approve_account"
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_existing_users"),
        ("auth", "0012_alter_user_first_name_max_length"),
        ("contenttypes", "0002_remove_content_type_name"),
    ]

    operations = [
        migrations.AlterModelOptions(
            name="account",
            options={
                "permissions": [("approve_account", "Can approve accounts")],
                "verbose_name": "Account",
                "verbose_name_plural": "Accounts",
            },
        ),
        migrations.RunPython(forwards, backwards),
    ]
