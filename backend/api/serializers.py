from django.contrib.auth.models import User
from rest_framework import serializers

from referee.models import Referee
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
        ]
        extra_kwargs = {"password": {"write_only": True}}

    def get_permissions(self, user) -> list[str]:
        """Model permissions, e.g. "competition.add_event", for the frontend."""
        return sorted(user.get_all_permissions())

    def create(self, validated_data):
        referee_data = validated_data.pop("referee")
        user = User.objects.create_user(**validated_data)
        referee = Referee.objects.create(user=user, **referee_data)  # noqa: F841
        return user

    def update(self, validated_data):
        user_id = validated_data.pop("id")
        referee_data = validated_data.pop("referee")
        user = (  # noqa: F841
            User.objects.filter(pk=user_id).select_for_update().update(**validated_data)
        )
        referee = (  # noqa: F841
            Referee.objects.filter(pk=user_id)
            .select_for_update()
            .update(**referee_data)
        )
