from django.contrib.auth.models import User
from django.db import transaction
from rest_framework import serializers

from accounts.models import Account
from accounts.serializers import email_taken
from helper.serializers import AddressSerializer
from referee.serializers import RefereeSerializer


class UserSerializer(serializers.ModelSerializer):
    """
    The full profile, with the account state: whether the e-mail address is
    confirmed (a changed address starts unconfirmed), whether the user
    completed the onboarding, and, for staff members, how they want to hear
    about accounts awaiting approval.
    """

    referee = RefereeSerializer(many=False, read_only=False)
    permissions = serializers.SerializerMethodField()
    email_confirmed = serializers.SerializerMethodField()
    onboarded = serializers.BooleanField(source="account.onboarded", required=False)
    approval_notifications = serializers.ChoiceField(
        source="account.approval_notifications",
        choices=Account.Notifications.choices,
        required=False,
    )

    class Meta:
        model = User
        fields = [
            "id",
            "first_name",
            "last_name",
            "username",
            "email",
            "password",
            "referee",
            "permissions",
            "is_staff",
            "email_confirmed",
            "onboarded",
            "approval_notifications",
        ]
        extra_kwargs = {
            "password": {"write_only": True},
            "is_staff": {"read_only": True},
        }

    def validate_email(self, email):
        if email and email_taken(email, exclude=self.instance):
            raise serializers.ValidationError("This e-mail address is already in use.")
        return email

    def _value(self, attrs, field):
        if field in attrs:
            return attrs[field]
        return getattr(self.instance, field, "")

    def _validate_account(self, attrs):
        account = attrs.get("account", {})
        if account.get("onboarded"):
            missing = {
                field: ["This field is required."]
                for field in ("first_name", "last_name")
                if not str(self._value(attrs, field)).strip()
            }
            if missing:
                raise serializers.ValidationError(missing)
        notifications = account.get("approval_notifications")
        if notifications not in (None, Account.Notifications.NEVER) and not getattr(
            self.instance, "is_staff", False
        ):
            raise serializers.ValidationError(
                {"approval_notifications": ["Only staff members get these e-mails."]}
            )

    def validate(self, attrs):
        self._validate_account(attrs)
        # A referee's address is personal: nothing else may use it.
        address = attrs.get("referee", {}).get("address")
        referee = getattr(self.instance, "referee", None)
        if address is not None and address.is_used(except_referee=referee):
            raise serializers.ValidationError(
                {"referee": {"address": ["This address is used elsewhere."]}}
            )
        return attrs

    def get_email_confirmed(self, user) -> bool:
        account = getattr(user, "account", None)
        return account is not None and account.email_confirmed

    def get_permissions(self, user) -> list[str]:
        """Model permissions, e.g. "competition.add_event", for the frontend."""
        return sorted(user.get_all_permissions())

    @staticmethod
    def _update_referee(user, referee_data):
        # The referee profile is created with the user (referee.signals).
        referee = user.referee
        for field, value in referee_data.items():
            setattr(referee, field, value)
        referee.save()

    @transaction.atomic
    def create(self, validated_data):
        validated_data.pop("account", None)
        referee_data = validated_data.pop("referee", None)
        user = User.objects.create_user(**validated_data)
        if referee_data:
            self._update_referee(user, referee_data)
        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        referee_data = validated_data.pop("referee", None)
        account_data = validated_data.pop("account", None)
        password = validated_data.pop("password", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()
        if referee_data:
            self._update_referee(instance, referee_data)
        if account_data:
            account = instance.account
            for field, value in account_data.items():
                setattr(account, field, value)
            account.save()
        return instance


class ProfileSerializer(serializers.ModelSerializer):
    """
    A user as other users see them. Each piece of personal information (the
    e-mail address, phone number, mobile phone number, date of birth and
    personal address) is null unless the user shares it; the IBAN and
    permissions are never shown.
    """

    name = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    mobile = serializers.SerializerMethodField()
    dob = serializers.SerializerMethodField()
    address = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "name",
            "email",
            "phone",
            "mobile",
            "dob",
            "address",
        ]
        read_only_fields = fields

    @staticmethod
    def _referee(user):
        return getattr(user, "referee", None)

    def _shared(self, user, flag):
        """The referee profile if it shares the given flag, else None."""
        referee = self._referee(user)
        if referee is not None and getattr(referee, flag):
            return referee
        return None

    def get_name(self, user) -> str:
        full = " ".join([user.first_name, user.last_name]).strip()
        return full or user.username

    def get_email(self, user) -> str | None:
        return user.email if self._shared(user, "share_email") else None

    def get_phone(self, user) -> str | None:
        referee = self._shared(user, "share_phone")
        return referee.phone if referee else None

    def get_mobile(self, user) -> str | None:
        referee = self._shared(user, "share_mobile")
        return referee.mobile if referee else None

    def get_dob(self, user) -> str | None:
        referee = self._shared(user, "share_dob")
        if referee is None or referee.dob is None:
            return None
        return referee.dob.isoformat()

    def get_address(self, user) -> dict | None:
        referee = self._shared(user, "share_address")
        if referee is None or referee.address is None:
            return None
        return AddressSerializer(referee.address).data
