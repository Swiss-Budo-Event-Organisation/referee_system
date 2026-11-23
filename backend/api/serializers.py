from django.contrib.auth.models import User
from django.db import transaction
from rest_framework import serializers

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
