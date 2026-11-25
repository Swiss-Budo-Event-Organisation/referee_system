from django.contrib.auth.models import User
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics
from rest_framework import status
from rest_framework.exceptions import MethodNotAllowed
from rest_framework.exceptions import NotFound
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import SAFE_METHODS
from rest_framework.permissions import AllowAny
from rest_framework.permissions import BasePermission
from rest_framework.permissions import DjangoModelPermissions
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from api.serializers import ProfileSerializer
from api.serializers import UserCreateSerializer
from api.serializers import UserSerializer
from competition.invitations import current_invitation
from competition.invitations import missing_emails
from competition.invitations import save_invitation
from competition.invitations import send_invitation
from competition.models import Accommodation
from competition.models import Application
from competition.models import Competition
from competition.models import CompetitionCategory
from competition.models import Event
from competition.permissions import administers_any
from competition.permissions import can_apply
from competition.permissions import can_assign_categories
from competition.permissions import can_create_event
from competition.permissions import can_create_events
from competition.permissions import can_invite
from competition.permissions import can_manage_competition
from competition.permissions import managed_applications
from competition.permissions import observed_competitions
from competition.serializers import AccommodationSerializer
from competition.serializers import ApplicationSerializer
from competition.serializers import CompetitionCategorySerializer
from competition.serializers import CompetitionOverviewSerializer
from competition.serializers import CompetitionSerializer
from competition.serializers import EventApplicationSerializer
from competition.serializers import EventApplicationStatusSerializer
from competition.serializers import EventFormSerializer
from competition.serializers import EventSerializer
from competition.serializers import InvitationFormSerializer
from competition.serializers import OwnApplicationSerializer
from competition.serializers import invitation_overview
from competition.serializers import received_invitation
from helper.models import Address
from helper.models import Location
from helper.serializers import AddressSerializer
from helper.serializers import LocationSerializer
from referee.models import Examination
from referee.models import Referee
from referee.models import RefereeLicense
from referee.permissions import can_examine
from referee.serializers import ExaminationSerializer
from referee.serializers import OwnExaminationSerializer
from referee.serializers import RefereeLicenseSerializer
from referee.serializers import RefereeOptionSerializer


class CompetitionPermission(DjangoModelPermissions):
    """
    Model permissions plus the category check: changing or deleting a
    competition requires administering one of its categories, or being a
    staff member.
    """

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS or request.user.is_staff:
            return True
        return can_manage_competition(request.user, obj)


def _check_categories(user, categories, current=()):
    if categories is None:
        return
    if user.is_staff:
        if not categories:
            raise ValidationError({"category": ["Choose at least one category."]})
        return
    if not can_assign_categories(user, categories, current):
        raise PermissionDenied(detail="You may only assign categories you administer.")


def _keep_fixed_fields(serializer, instance, *fields):
    for field in fields:
        value = serializer.validated_data.get(field, getattr(instance, field))
        if value != getattr(instance, field):
            raise ValidationError({field: "This field cannot be changed."})


class CreateUserView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = UserCreateSerializer
    permission_classes = [AllowAny]


def is_admin(user) -> bool:
    return user.is_staff or user.is_superuser


class DetailUserView(generics.RetrieveUpdateAPIView):
    """
    The full, unredacted profile: users see their own, staff members any.
    Other users see the redacted profile at profiles/<pk>/.
    """

    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if is_admin(user):
            return User.objects.all()
        return User.objects.filter(id=user.id)


class UpdateUserView(generics.RetrieveUpdateAPIView):
    """Users may change their own account; staff members any account."""

    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if is_admin(user):
            return User.objects.all()
        return User.objects.filter(id=user.id)


class ProfileQuerysetMixin:
    queryset = (
        User.objects.filter(is_active=True)
        .select_related("referee", "referee__address")
        .order_by("last_name", "first_name", "username")
    )
    serializer_class = ProfileSerializer
    permission_classes = [IsAuthenticated]


class ListProfilesView(ProfileQuerysetMixin, generics.ListAPIView):
    """
    The redacted profiles of all active users, for any logged-in user.
    """


class DetailProfileView(ProfileQuerysetMixin, generics.RetrieveAPIView):
    """
    The redacted profile of one user (by user id), for any logged-in user.
    """


class CreateEventView(generics.CreateAPIView):
    queryset = Event.objects.all()
    serializer_class = EventSerializer
    permission_classes = [DjangoModelPermissions]


class CanCreateEvents(BasePermission):
    message = "You may not create events."

    def has_permission(self, request, view):
        return can_create_events(request.user)


class CreateEventWithCompetitionsView(generics.CreateAPIView):
    """
    Create an event together with its competitions from a single form.

    Staff members may create any event; others need the permission to add
    events and must administer one of the categories of the event.
    """

    queryset = Event.objects.all()
    serializer_class = EventFormSerializer
    permission_classes = [IsAuthenticated, CanCreateEvents]

    def perform_create(self, serializer):
        if not can_create_event(self.request.user, _form_categories(serializer)):
            raise PermissionDenied(detail=NOT_CATEGORY_ADMIN)
        serializer.save(creator=self.request.user)


NOT_CATEGORY_ADMIN = "You must be an admin of at least one of the categories."


def _form_categories(serializer):
    return [
        category
        for competition in serializer.validated_data["competitions"]
        for category in competition["category"]
    ]


class CanChangeEvent(BasePermission):
    """The user may change the event, see competition.backends."""

    message = "You may not edit this event."

    def has_object_permission(self, request, view, obj):
        return request.user.has_perm("competition.change_event", obj)


class EditEventWithCompetitionsView(generics.RetrieveUpdateAPIView):
    """
    Load and save an event with its competitions for the edit form. Admins of
    one of the event's categories and staff members may edit it; afterwards
    the user must still administer one of the categories.
    """

    queryset = Event.objects.all()
    serializer_class = EventFormSerializer
    permission_classes = [IsAuthenticated, CanChangeEvent]
    http_method_names = ["get", "put", "head", "options"]

    def perform_update(self, serializer):
        if not administers_any(self.request.user, _form_categories(serializer)):
            raise PermissionDenied(detail=NOT_CATEGORY_ADMIN)
        serializer.save()


class EventApplicationsView(generics.ListCreateAPIView):
    """
    All applications for the competitions of an event, by competition, status
    (furthest along first) and date. Observers, admins and staff may list
    them. Those who may edit the event may also add an application for any
    referee, bypassing the registration, license and membership checks.
    """

    serializer_class = EventApplicationSerializer
    permission_classes = [IsAuthenticated]

    def get_event(self):
        event = get_object_or_404(Event, pk=self.kwargs["pk"])
        if self.request.method in SAFE_METHODS:
            if not self.request.user.has_perm("competition.view_event", event):
                raise PermissionDenied(detail="You may not view this event.")
        elif not self.request.user.has_perm("competition.change_event", event):
            raise PermissionDenied(detail=CanChangeEvent.message)
        return event

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        self.event = self.get_event()

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if hasattr(self, "event"):
            context["event"] = self.event
        return context

    def get_queryset(self):
        return (
            Application.objects.filter(competition__event=self.event)
            .select_related("user__user")
            .order_by("competition__start", "-status", "created")
        )


class EventApplicationDetailView(EventApplicationsView, generics.UpdateAPIView):
    """
    Remove an application of an event: those who may edit the event may set
    its status to cancelled or declined; only staff members may delete it
    from the database.
    """

    serializer_class = EventApplicationStatusSerializer
    http_method_names = ["patch", "delete", "options"]

    def get_object(self):
        return get_object_or_404(self.get_queryset(), pk=self.kwargs["application"])

    def delete(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied(
                detail="Only staff members may delete applications. "
                "Set the status to cancelled or declined instead."
            )
        self.get_object().delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ListEventsView(generics.ListAPIView):
    queryset = Event.objects.all()
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]


class ListFurtureEventsView(generics.ListAPIView):
    queryset = Event.objects.filter(start__gte=timezone.now())
    serializer_class = EventSerializer
    permission_classes = [IsAuthenticated]


class DetailEventView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Event.objects.all()
    serializer_class = EventSerializer
    permission_classes = [DjangoModelPermissions]


class CreateCompetitionView(generics.CreateAPIView):
    queryset = Competition.objects.all()
    serializer_class = CompetitionSerializer
    permission_classes = [CompetitionPermission]

    def perform_create(self, serializer):
        _check_categories(
            self.request.user, serializer.validated_data.get("category", [])
        )
        serializer.save()


class DetailCompetitionView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Competition.objects.all()
    permission_classes = [CompetitionPermission]

    def get_serializer_class(self):
        if self.request.method in SAFE_METHODS:
            return CompetitionOverviewSerializer
        return CompetitionSerializer

    def perform_update(self, serializer):
        _check_categories(
            self.request.user,
            serializer.validated_data.get("category"),
            serializer.instance.category.all(),
        )
        serializer.save()


class CompetitionApplicationsView(generics.ListAPIView):
    """
    Applications of one competition, for admins and observers of one of its
    categories.
    """

    serializer_class = ApplicationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        competition = get_object_or_404(
            observed_competitions(self.request.user), pk=self.kwargs["pk"]
        )
        return competition.applications.all()


class ListCompetitionCategoriesView(generics.ListAPIView):
    queryset = CompetitionCategory.objects.all()
    serializer_class = CompetitionCategorySerializer
    permission_classes = [IsAuthenticated]


class ListRefereesView(generics.ListAPIView):
    queryset = Referee.objects.select_related("user").order_by(
        "user__last_name", "user__first_name", "user__username"
    )
    serializer_class = RefereeOptionSerializer
    permission_classes = [IsAuthenticated]


class CreateCompetitionCategoryView(generics.CreateAPIView):
    queryset = CompetitionCategory.objects.all()
    serializer_class = CompetitionCategorySerializer
    permission_classes = [DjangoModelPermissions]


class CreateAccommodationView(generics.CreateAPIView):
    queryset = Accommodation.objects.all()
    serializer_class = AccommodationSerializer
    permission_classes = [DjangoModelPermissions]


class CreateListApplicationView(generics.ListCreateAPIView):
    serializer_class = OwnApplicationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user.referee
        return Application.objects.filter(user=user)

    def perform_create(self, serializer):
        if serializer.is_valid():
            if serializer.validated_data.get("user") != self.request.user.referee:
                raise PermissionDenied(
                    detail="You are not allowed to apply someone else."
                )
            competition = serializer.validated_data["competition"]
            if not can_apply(self.request.user, competition):
                raise PermissionDenied(
                    detail="Only members of one of the competition's categories "
                    "may apply."
                )
            if not competition.registration_open():
                raise ValidationError(
                    {"competition": ["Registration for this competition is closed."]}
                )
            if not competition.is_eligible(self.request.user.referee):
                raise ValidationError(
                    {
                        "competition": [
                            "You need at least the "
                            f"{competition.minimum_level} license to apply."
                        ]
                    }
                )
            serializer.save(user=self.request.user.referee)
        else:
            print(serializer.errors)


class DetailOwnApplicationView(generics.RetrieveUpdateAPIView):
    """
    Every referee may view and change their own applications.
    """

    serializer_class = OwnApplicationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Application.objects.filter(user=self.request.user.referee)

    def perform_update(self, serializer):
        _keep_fixed_fields(serializer, serializer.instance, "user", "competition")
        serializer.save()


class OwnApplicationInvitationView(APIView):
    """
    The invitation sent last for one of the user's own applications, read
    only. Only referees invited in it may read it.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        application = get_object_or_404(
            Application.objects.select_related("competition__event__location__address"),
            pk=self.kwargs["pk"],
            user__user=request.user,
        )
        invitation = current_invitation(application)
        if invitation is None:
            raise NotFound(detail="You were not invited for this competition.")
        return Response(received_invitation(invitation))


class ManageApplicationView(generics.RetrieveUpdateAPIView):
    """
    Competition admins may change applications (e.g. status and role) of
    competitions in the categories they administer.
    """

    serializer_class = ApplicationSerializer
    permission_classes = [DjangoModelPermissions]

    def get_queryset(self):
        return managed_applications(self.request.user)

    def perform_update(self, serializer):
        _keep_fixed_fields(serializer, serializer.instance, "user", "competition")
        serializer.save()


class DeleteApplicationView(generics.DestroyAPIView):
    serializer_class = ApplicationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Application.objects.filter(user=user).filter(
            status=Application.Status.APPLIED
        )

    def perform_destroy(self, instance):
        if timezone.now() - instance.created < timezone.timedelta(minutes=30):
            return super().perform_destroy(instance)
        instance.status = Application.Status.CANCELLED
        instance.save()
        raise MethodNotAllowed(instance)


class CompetitionInvitationView(APIView):
    """
    The invitation of a competition, for its invitor and staff members.

    GET returns the draft (or the invitation sent last as starting point)
    with all applications. PUT saves the draft: selected applications become
    selected, the others not selected. Referees who didn't apply get an
    application.
    """

    permission_classes = [IsAuthenticated]
    send = False

    def get_competition(self):
        competition = get_object_or_404(
            Competition.objects.select_related("event__location"), pk=self.kwargs["pk"]
        )
        if not can_invite(self.request.user, competition):
            raise PermissionDenied(
                detail="Only the invitor of the competition may invite referees."
            )
        return competition

    def get(self, request, *args, **kwargs):
        return Response(invitation_overview(self.get_competition(), request.user))

    def save(self, request, competition):
        serializer = InvitationFormSerializer(
            data=request.data,
            context={
                "competition": competition,
                "send": self.send,
                "user": request.user,
            },
        )
        serializer.is_valid(raise_exception=True)
        return save_invitation(competition, **serializer.validated_data)

    def put(self, request, *args, **kwargs):
        competition = self.get_competition()
        self.save(request, competition)
        return Response(invitation_overview(competition, request.user))


class SendCompetitionInvitationView(CompetitionInvitationView):
    """
    Save and send the invitation: the invited applications become invited,
    all others declined. Every invited referee gets an e-mail with the list
    of all invited referees and the head referee.
    """

    send = True
    http_method_names = ["post", "options"]

    @transaction.atomic
    def post(self, request, *args, **kwargs):
        competition = self.get_competition()
        invitation = send_invitation(self.save(request, competition), request.user)
        data = invitation_overview(competition, request.user)
        data["missing_email"] = missing_emails(invitation)
        return Response(data)


class UpdateAddressView(generics.RetrieveUpdateAPIView):
    """
    Addresses of locations and examinations are open to any logged-in user.
    A referee's home address is only shown to the referee, to staff members
    and, if the referee shares their contact details, to other users; only
    the referee and staff members may change it.
    """

    queryset = Address.objects.all()
    serializer_class = AddressSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        address = super().get_object()
        residents = Referee.objects.filter(address=address)
        if not residents.exists():
            return address
        user = self.request.user
        if is_admin(user) or residents.filter(user=user).exists():
            return address
        if (
            self.request.method in SAFE_METHODS
            and residents.filter(share_contact_details=True).exists()
        ):
            return address
        # Don't reveal that the address exists.
        raise NotFound()


class CreateAddressView(generics.CreateAPIView):
    queryset = Address.objects.all()
    serializer_class = AddressSerializer
    permission_classes = [IsAuthenticated]


class CreateLocationView(generics.CreateAPIView):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer
    permission_classes = [DjangoModelPermissions]


class ListLocationsView(generics.ListAPIView):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer
    permission_classes = [IsAuthenticated]


class DetailLocationView(generics.RetrieveUpdateAPIView):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer
    permission_classes = [IsAuthenticated]


class ListLicenseView(generics.ListCreateAPIView):
    """
    Everyone may list licenses; creating requires the add permission, which
    only the National Admin group has.
    """

    queryset = RefereeLicense.objects.all()
    serializer_class = RefereeLicenseSerializer
    permission_classes = [DjangoModelPermissions]


class DetailLicenseView(generics.RetrieveUpdateAPIView):
    queryset = RefereeLicense.objects.all()
    serializer_class = RefereeLicenseSerializer
    permission_classes = [DjangoModelPermissions]


class CreateExaminationView(generics.CreateAPIView):
    """
    Examiners may record examinations for the licenses of their examiner
    group.
    """

    queryset = Examination.objects.all()
    serializer_class = ExaminationSerializer
    permission_classes = [DjangoModelPermissions]

    def perform_create(self, serializer):
        if not can_examine(self.request.user, serializer.validated_data["license"]):
            raise PermissionDenied(
                detail="You may not record examinations for this license."
            )
        serializer.save()


class ListExaminationsView(generics.ListAPIView):
    """
    The logged-in referee's own examinations, without the internal note.
    """

    serializer_class = OwnExaminationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        return Examination.objects.filter(candidate=user.referee)
