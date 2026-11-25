from django.contrib.auth.models import User
from django.db import transaction
from rest_framework import serializers

from helper.serializers import AddressSerializer
from referee.serializers import RefereeSerializer


class UserCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "password"]
        extra_kwargs = {"password": {"write_only": True}}

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class UserSerializer(serializers.ModelSerializer):
    referee = RefereeSerializer(many=False, read_only=False)
    permissions = serializers.SerializerMethodField()

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
        ]
        extra_kwargs = {
            "password": {"write_only": True},
            "is_staff": {"read_only": True},
        }

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
        referee_data = validated_data.pop("referee", None)
        user = User.objects.create_user(**validated_data)
        if referee_data:
            self._update_referee(user, referee_data)
        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        referee_data = validated_data.pop("referee", None)
        password = validated_data.pop("password", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()
        if referee_data:
            self._update_referee(instance, referee_data)
        return instance


class ProfileSerializer(serializers.ModelSerializer):
    """
    A user as other users see them. The contact details (e-mail address,
    phone numbers and address) are null unless the user agreed to share
    them; the date of birth, IBAN and permissions are never shown.
    """

    name = serializers.SerializerMethodField()
    shares_contact_details = serializers.SerializerMethodField()
    email = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    mobile = serializers.SerializerMethodField()
    address = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "name",
            "shares_contact_details",
            "email",
            "phone",
            "mobile",
            "address",
        ]
        read_only_fields = fields

    @staticmethod
    def _referee(user):
        return getattr(user, "referee", None)

    def _shared(self, user):
        """The referee profile if its contact details are shared, else None."""
        referee = self._referee(user)
        if referee is not None and referee.share_contact_details:
            return referee
        return None

    def get_name(self, user) -> str:
        full = " ".join([user.first_name, user.last_name]).strip()
        return full or user.username

    def get_shares_contact_details(self, user) -> bool:
        return self._shared(user) is not None

    def get_email(self, user) -> str | None:
        return user.email if self._shared(user) else None

    def get_phone(self, user) -> str | None:
        referee = self._shared(user)
        return referee.phone if referee else None

    def get_mobile(self, user) -> str | None:
        referee = self._shared(user)
        return referee.mobile if referee else None

    def get_address(self, user) -> dict | None:
        referee = self._shared(user)
        if referee is None or referee.address is None:
            return None
        return AddressSerializer(referee.address).data
