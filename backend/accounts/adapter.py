"""How django-allauth fits the accounts of this project."""

from allauth.account.adapter import DefaultAccountAdapter


class AccountAdapter(DefaultAccountAdapter):
    def is_open_for_signup(self, request):
        """
        New users register through accounts.views.RegisterView, which holds
        the account for approval, so allauth's own signup stays closed.
        """
        return False
