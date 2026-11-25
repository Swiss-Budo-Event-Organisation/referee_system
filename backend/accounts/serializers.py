from django.contrib.auth import password_validation
from django.contrib.auth.models import Group
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from accounts.models import Account
from referee.models import Examination
from referee.models import Referee


def email_taken(email: str, exclude: User | None = None) -> bool:
    users = User.objects.filter(email__iexact=email)
    if exclude is not None:
        users = users.exclude(pk=exclude.pk)
    return users.exists()


class AccountSerializer(serializers.ModelSerializer):
    """
    The account state in the user's full profile: whether the e-mail address
    is confirmed (a changed address starts unconfirmed), whether the user
    completed the onboarding, and, for staff members, how they want to hear
    about accounts awaiting approval.
    """

    email_confirmed = serializers.BooleanField(read_only=True)

    class Meta:
        model = Account
        fields = ["onboarded", "email_confirmed", "approval_notifications"]
        extra_kwargs = {
            "onboarded": {"required": False},
            "approval_notifications": {"required": False},
        }


class RegistrationSerializer(serializers.ModelSerializer):
    """
    A new user: inactive until a staff member approves them. The password is
    entered twice.
    """

    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    password_repeat = serializers.CharField(
        write_only=True, style={"input_type": "password"}
    )

    class Meta:
        model = User
        fields = [
            "username",
            "email",
            "first_name",
            "last_name",
            "password",
            "password_repeat",
        ]

    def validate_email(self, email):
        if email_taken(email):
            raise serializers.ValidationError("This e-mail address is already in use.")
        return email

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password_repeat"):
            raise serializers.ValidationError(
                {"password_repeat": ["The passwords do not match."]}
            )
        candidate = User(
            username=attrs["username"],
            email=attrs["email"],
            first_name=attrs["first_name"],
            last_name=attrs["last_name"],
        )
        try:
            password_validation.validate_password(attrs["password"], candidate)
        except DjangoValidationError as error:
            raise serializers.ValidationError(
                {"password": list(error.messages)}
            ) from error
        return attrs

    def create(self, validated_data):
        return User.objects.create_user(is_active=False, **validated_data)


class PendingAccountSerializer(serializers.ModelSerializer):
    """A registration as staff members see it in the approval list."""

    expires = serializers.DateTimeField(source="account.expires", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "date_joined",
            "expires",
        ]
        read_only_fields = fields


class HeldExaminationSerializer(serializers.ModelSerializer):
    """An examination the new user already passed, recorded on approval."""

    class Meta:
        model = Examination
        fields = ["license", "date", "grade", "chief_examiner", "note_external"]
        extra_kwargs = {
            "chief_examiner": {"required": False},
            "grade": {"required": False},
            "note_external": {"required": False},
        }


class ApprovalSerializer(serializers.Serializer):
    """Approve a registration, with groups and examinations to record."""

    groups = serializers.PrimaryKeyRelatedField(
        queryset=Group.objects.all(), many=True, required=False
    )
    examinations = HeldExaminationSerializer(many=True, required=False)

    @transaction.atomic
    def approve(self, user: User, approver: User) -> User:
        user.is_active = True
        user.save(update_fields=["is_active"])
        account = user.account
        account.approved = timezone.now()
        account.approved_by = approver
        account.save(update_fields=["approved", "approved_by"])
        groups = self.validated_data.get("groups", [])
        if groups:
            user.groups.add(*groups)
        referee = Referee.objects.get(user=user)
        for exam in self.validated_data.get("examinations", []):
            Examination.objects.create(candidate=referee, passed=True, **exam)
        return user


class GroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ["id", "name"]


class TokenSerializer(serializers.Serializer):
    token = serializers.CharField()
