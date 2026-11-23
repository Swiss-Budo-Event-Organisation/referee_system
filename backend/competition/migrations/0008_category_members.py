import django.db.models.deletion
from django.db import migrations
from django.db import models

from competition.groups import group_names


def link_member_groups(apps, schema_editor):
    """Link every category to the member group carrying its name."""
    db_alias = schema_editor.connection.alias
    Group = apps.get_model("auth", "Group")
    CompetitionCategory = apps.get_model("competition", "CompetitionCategory")
    for category in CompetitionCategory.objects.using(db_alias).filter(
        members__isnull=True
    ):
        member_name = group_names(category.name)[0]
        category.members, _ = Group.objects.using(db_alias).get_or_create(
            name=member_name
        )
        category.save(update_fields=["members"])


class Migration(migrations.Migration):
    dependencies = [
        ("auth", "0012_alter_user_first_name_max_length"),
        ("competition", "0007_optional_minimum_level"),
    ]

    operations = [
        migrations.AddField(
            model_name="competitioncategory",
            name="members",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="member_categories",
                to="auth.group",
                verbose_name="Member group",
            ),
        ),
        migrations.RunPython(link_member_groups, migrations.RunPython.noop),
    ]
