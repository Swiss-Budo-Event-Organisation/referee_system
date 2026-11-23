"""
Groups belonging to a competition category.

Every category has three groups: one with the category's name for its
members, one with the suffix "Admin" for those managing its competitions and
one with the suffix "Observer" for those who may view them.

The functions take the model classes as arguments so that migrations can
pass their historical models.
"""

ADMIN_SUFFIX = "Admin"
OBSERVER_SUFFIX = "Observer"

# Models admins manage (full CRUD) and observers may view.
MANAGED_MODELS = {
    "competition": [
        "event",
        "competition",
        "competitioncategory",
        "accommodation",
        "application",
        "invitation",
    ],
}
# Models admins and observers may view only.
VIEW_ONLY_MODELS = {
    "referee": ["referee", "refereelicense", "examination", "refereerole"],
}
# Admins must not edit categories, as that would let them change which group
# administers a category.
CATEGORY_PERMISSIONS = [
    "add_competitioncategory",
    "change_competitioncategory",
    "delete_competitioncategory",
]


def group_names(name: str) -> tuple[str, str, str]:
    """Names of the member, admin and observer group of a category."""
    return name, f"{name} {ADMIN_SUFFIX}", f"{name} {OBSERVER_SUFFIX}"


def _permissions(Permission, models, actions, using):
    return Permission.objects.using(using).filter(
        content_type__app_label__in=models.keys(),
        codename__in=[
            f"{action}_{model}"
            for model_list in models.values()
            for model in model_list
            for action in actions
        ],
    )


def admin_permissions(Permission, using="default"):
    managed = _permissions(
        Permission, MANAGED_MODELS, ["add", "change", "delete", "view"], using
    ).exclude(codename__in=CATEGORY_PERMISSIONS)
    view_only = _permissions(Permission, VIEW_ONLY_MODELS, ["view"], using)
    return list(managed) + list(view_only)


def observer_permissions(Permission, using="default"):
    return list(_permissions(Permission, MANAGED_MODELS, ["view"], using)) + list(
        _permissions(Permission, VIEW_ONLY_MODELS, ["view"], using)
    )


def create_category_groups(category, Group, Permission, using="default"):
    """
    Create the three groups of a category and link the admin and observer
    group to it, unless the category already has groups assigned.
    """
    groups = Group.objects.using(using)
    member_name, admin_name, observer_name = group_names(category.name)
    groups.get_or_create(name=member_name)

    changes = {}
    if category.admins_id is None:
        admin, created = groups.get_or_create(name=admin_name)
        if created:
            admin.permissions.add(*admin_permissions(Permission, using))
        changes["admins"] = admin
    if category.observers_id is None:
        observer, created = groups.get_or_create(name=observer_name)
        if created:
            observer.permissions.add(*observer_permissions(Permission, using))
        changes["observers"] = observer

    if changes:
        # update() instead of save() so that post_save is not sent again.
        type(category).objects.using(using).filter(pk=category.pk).update(**changes)
        for field, group in changes.items():
            setattr(category, field, group)


def rename_category_groups(category, old_name, Group, using="default"):
    """
    Rename the groups of a category after the category was renamed.

    The member group and the admin and observer group are renamed only while
    they still carry the default name for the old category name, so groups
    assigned by hand keep their names. A group is also left alone if a group
    with the new name exists already.
    """
    groups = Group.objects.using(using)
    old_names = group_names(old_name)
    new_names = group_names(category.name)
    linked = [None, category.admins_id, category.observers_id]
    for old, new, linked_id in zip(old_names, new_names, linked, strict=True):
        if groups.filter(name=new).exists():
            continue
        candidates = groups.filter(name=old)
        if linked_id is not None:
            candidates = candidates.filter(pk=linked_id)
        candidates.update(name=new)
