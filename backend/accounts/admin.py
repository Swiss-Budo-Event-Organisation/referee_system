from django.contrib import admin

from accounts.models import Account


@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ["user", "approved", "onboarded", "approval_notifications"]
    list_filter = ["onboarded", "approval_notifications"]
    raw_id_fields = ["user", "approved_by"]
