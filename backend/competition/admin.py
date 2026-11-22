from django import forms
from django.contrib import admin

from competition.models import Accommodation
from competition.models import Application
from competition.models import Competition
from competition.models import CompetitionCategory
from competition.models import Event
from competition.models import Invitation
from competition.permissions import can_assign_categories
from competition.permissions import can_manage_competition
from competition.permissions import managed_competitions
from competition.permissions import observed_competitions


class CompetitionAdminForm(forms.ModelForm):
    user = None

    class Meta:
        model = Competition
        fields = [
            "event",
            "invitor",
            "minimum_level",
            "desired_level",
            "start",
            "duration",
            "competition_fields",
            "category",
            "info",
            "head_referee",
            "referees",
            "observers",
            "application",
            "application_open",
            "application_close",
        ]

    def clean_category(self):
        categories = self.cleaned_data["category"]
        current = self.instance.category.all() if self.instance.pk else []
        if not can_assign_categories(self.user, categories, current):
            raise forms.ValidationError(
                "You may only assign categories you administer."
            )
        return categories


@admin.register(Competition)
class CompetitionAdmin(admin.ModelAdmin):
    form = CompetitionAdminForm
    list_display = ["__str__", "start"]
    list_filter = ["category"]

    def get_form(self, request, obj=None, change=False, **kwargs):
        form = super().get_form(request, obj, change, **kwargs)
        form.user = request.user
        return form

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.filter(pk__in=observed_competitions(request.user))

    def has_change_permission(self, request, obj=None):
        allowed = super().has_change_permission(request, obj)
        if obj is None:
            return allowed
        return allowed and can_manage_competition(request.user, obj)

    def has_delete_permission(self, request, obj=None):
        allowed = super().has_delete_permission(request, obj)
        if obj is None:
            return allowed
        return allowed and can_manage_competition(request.user, obj)


class CompetitionScopedAdmin(admin.ModelAdmin):
    """
    Admin for models belonging to a competition: visible to observers of the
    competition's categories, editable by its admins.
    """

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.filter(competition__in=observed_competitions(request.user))

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "competition":
            kwargs["queryset"] = managed_competitions(request.user)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)

    def _manages(self, request, obj):
        return obj.competition is not None and can_manage_competition(
            request.user, obj.competition
        )

    def has_change_permission(self, request, obj=None):
        allowed = super().has_change_permission(request, obj)
        if obj is None:
            return allowed
        return allowed and self._manages(request, obj)

    def has_delete_permission(self, request, obj=None):
        allowed = super().has_delete_permission(request, obj)
        if obj is None:
            return allowed
        return allowed and self._manages(request, obj)


@admin.register(Application)
class ApplicationAdmin(CompetitionScopedAdmin):
    list_display = ["__str__", "status", "role"]
    list_filter = ["status", "competition__category"]


@admin.register(Invitation)
class InvitationAdmin(CompetitionScopedAdmin):
    pass


admin.site.register(Event)
admin.site.register(CompetitionCategory)
admin.site.register(Accommodation)
