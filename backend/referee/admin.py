from django.contrib import admin

from referee.models import Examination
from referee.models import Referee
from referee.models import RefereeLicense
from referee.models import RefereeRole
from referee.permissions import examinable_licenses
from referee.permissions import sees_all_examinations


@admin.register(Examination)
class ExaminationAdmin(admin.ModelAdmin):
    list_display = ["__str__", "date", "license", "passed"]
    list_filter = ["license", "passed"]

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        if sees_all_examinations(request.user):
            return qs
        return qs.filter(license__in=examinable_licenses(request.user))

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "license" and not request.user.is_superuser:
            kwargs["queryset"] = examinable_licenses(request.user)
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


admin.site.register(Referee)
admin.site.register(RefereeLicense)
admin.site.register(RefereeRole)
