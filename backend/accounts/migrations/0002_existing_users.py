from django.db import migrations


def create_accounts(apps, schema_editor):
    """Users from before approvals existed count as approved and onboarded."""
    User = apps.get_model("auth", "User")
    Account = apps.get_model("accounts", "Account")
    for user in User.objects.filter(account__isnull=True):
        Account.objects.create(user=user, approved=user.date_joined, onboarded=True)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_accounts, migrations.RunPython.noop),
    ]
