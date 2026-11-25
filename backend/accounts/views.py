from django.conf import settings
from django.contrib.auth.models import Group
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.permissions import BasePermission
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from accounts import emails
from accounts.models import pending_users
from accounts.serializers import ApprovalSerializer
from accounts.serializers import GroupSerializer
from accounts.serializers import PendingAccountSerializer
from accounts.serializers import RegistrationSerializer
from accounts.serializers import TokenSerializer
from accounts.tokens import check_token


class IsStaffMember(BasePermission):
    message = "Only staff members may do this."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_staff)


class RegistrationThrottle(AnonRateThrottle):
    def get_rate(self):
        return settings.REGISTRATION_THROTTLE_RATE


class RegisterView(generics.CreateAPIView):
    """
    Register a new account. It stays inactive until a staff member approves
    it; the user gets an e-mail saying so, and subscribed staff members are
    told how many accounts await approval.
    """

    serializer_class = RegistrationSerializer
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [RegistrationThrottle]

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        emails.registration_received(user)
        emails.notify_staff_now()
        return Response(
            {"detail": "Your registration is awaiting approval."},
            status=status.HTTP_201_CREATED,
        )


class PendingAccountsView(generics.ListAPIView):
    """Registrations awaiting approval, for staff members."""

    serializer_class = PendingAccountSerializer
    permission_classes = [IsStaffMember]

    def get_queryset(self):
        return pending_users().select_related("account")


class PendingAccountDetailView(generics.DestroyAPIView):
    """Delete a registration awaiting approval."""

    permission_classes = [IsStaffMember]

    def get_queryset(self):
        return pending_users()


class ApproveAccountView(APIView):
    """
    Approve a registration: the account becomes active, gets the chosen
    groups and examinations, and its owner an e-mail with a link to confirm
    their address and complete their profile.
    """

    permission_classes = [IsStaffMember]

    @transaction.atomic
    def post(self, request, pk):
        user = get_object_or_404(pending_users(), pk=pk)
        serializer = ApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.approve(user, request.user)
        emails.account_approved(user)
        return Response({"detail": "The account has been approved."})


class GroupListView(generics.ListAPIView):
    """The groups staff members may assign on approval."""

    queryset = Group.objects.order_by("name")
    serializer_class = GroupSerializer
    permission_classes = [IsStaffMember]


class ConfirmEmailView(APIView):
    """Confirm an e-mail address with the token from a link."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = TokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = check_token(serializer.validated_data["token"])
        if user is None:
            return Response(
                {"detail": "This link is invalid or has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        account = user.account
        account.confirmed_email = user.email
        account.save(update_fields=["confirmed_email"])
        return Response({"detail": "Your e-mail address is confirmed."})


class SendConfirmationView(APIView):
    """Send the logged-in user a link to confirm their e-mail address."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        if not user.email:
            return Response(
                {"detail": "Enter an e-mail address first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if user.account.email_confirmed:
            return Response({"detail": "Your e-mail address is already confirmed."})
        emails.confirm_email(user)
        return Response({"detail": "We sent you a link to confirm your address."})
