from django.urls import include
from django.urls import path

from accounts.views import ApproveAccountView
from accounts.views import ConfirmEmailView
from accounts.views import GroupListView
from accounts.views import PendingAccountDetailView
from accounts.views import PendingAccountsView
from accounts.views import RegisterView
from accounts.views import SendConfirmationView
from api.views import AddressView
from api.views import CompetitionApplicationsView
from api.views import CompetitionInvitationView
from api.views import CreateAddressView
from api.views import CreateCompetitionView
from api.views import CreateEventWithCompetitionsView
from api.views import CreateExaminationView
from api.views import CreateListApplicationView
from api.views import DetailCompetitionView
from api.views import DetailEventView
from api.views import DetailLicenseView
from api.views import DetailLocationView
from api.views import DetailOwnApplicationView
from api.views import DetailProfileView
from api.views import DetailUserView
from api.views import EditEventWithCompetitionsView
from api.views import EventApplicationDetailView
from api.views import EventApplicationsView
from api.views import ListCompetitionCategoriesView
from api.views import ListEventsView
from api.views import ListExaminationsView
from api.views import ListFurtureEventsView
from api.views import ListLicenseView
from api.views import ListLocationsView
from api.views import ListProfilesView
from api.views import ListRefereesView
from api.views import ManageApplicationView
from api.views import OwnApplicationInvitationView
from api.views import SendCompetitionInvitationView
from api.views import UpdateUserView

urlpatterns = [
    path("user/register/", RegisterView.as_view(), name="user-register"),
    path("accounts/pending/", PendingAccountsView.as_view(), name="pending-list"),
    path(
        "accounts/pending/<int:pk>/",
        PendingAccountDetailView.as_view(),
        name="pending-detail",
    ),
    path(
        "accounts/pending/<int:pk>/approve/",
        ApproveAccountView.as_view(),
        name="pending-approve",
    ),
    path("accounts/groups/", GroupListView.as_view(), name="group-list"),
    path("accounts/confirm-email/", ConfirmEmailView.as_view(), name="confirm-email"),
    path(
        "accounts/confirm-email/send/",
        SendConfirmationView.as_view(),
        name="confirm-email-send",
    ),
    path("user/<int:pk>/", DetailUserView.as_view(), name="user"),
    path("user/<int:pk>/update/", UpdateUserView.as_view(), name="user"),
    path("profiles/", ListProfilesView.as_view(), name="profile-list"),
    path("profiles/<int:pk>/", DetailProfileView.as_view(), name="profile-detail"),
    path("auth/", include("rest_framework.urls", namespace="rest_framework")),
    path("events/", ListEventsView.as_view(), name="event-list"),
    path(
        "events/create/",
        CreateEventWithCompetitionsView.as_view(),
        name="event-create",
    ),
    path("events/future/", ListFurtureEventsView.as_view(), name="event-list-future"),
    path("events/<int:pk>/", DetailEventView.as_view(), name="event-detail"),
    path(
        "events/<int:pk>/edit/",
        EditEventWithCompetitionsView.as_view(),
        name="event-edit",
    ),
    path(
        "events/<int:pk>/applications/",
        EventApplicationsView.as_view(),
        name="event-applications",
    ),
    path(
        "events/<int:pk>/applications/<int:application>/",
        EventApplicationDetailView.as_view(),
        name="event-application-detail",
    ),
    path("competition/", CreateCompetitionView.as_view(), name="competition-create"),
    path(
        "competition/<int:pk>/applications/",
        CompetitionApplicationsView.as_view(),
        name="competition-applications",
    ),
    path(
        "competition/<int:pk>/invitation/",
        CompetitionInvitationView.as_view(),
        name="competition-invitation",
    ),
    path(
        "competition/<int:pk>/invitation/send/",
        SendCompetitionInvitationView.as_view(),
        name="competition-invitation-send",
    ),
    path(
        "competition/<int:pk>/",
        DetailCompetitionView.as_view(),
        name="competition-detail",
    ),
    path("categories/", ListCompetitionCategoriesView.as_view(), name="category-list"),
    path("referees/", ListRefereesView.as_view(), name="referee-list"),
    path("locations/", ListLocationsView.as_view(), name="locations-list"),
    path("locations/<int:pk>/", DetailLocationView.as_view(), name="locations-detail"),
    path("licenses/", ListLicenseView.as_view(), name="license-list"),
    path("licenses/<int:pk>/", DetailLicenseView.as_view(), name="license-detail"),
    path(
        "applications/",
        CreateListApplicationView.as_view(),
        name="application-create-list",
    ),
    path(
        "applications/<int:pk>/",
        DetailOwnApplicationView.as_view(),
        name="application-detail",
    ),
    path(
        "applications/<int:pk>/invitation/",
        OwnApplicationInvitationView.as_view(),
        name="application-invitation",
    ),
    path(
        "applications/<int:pk>/manage/",
        ManageApplicationView.as_view(),
        name="application-manage",
    ),
    path("address/", CreateAddressView.as_view(), name="address-create"),
    path("address/<int:pk>/", AddressView.as_view(), name="address-detail"),
    path("examinations/", CreateExaminationView.as_view(), name="examination-create"),
    path(
        "examinations/user/", ListExaminationsView.as_view(), name="examinations-user"
    ),
]
