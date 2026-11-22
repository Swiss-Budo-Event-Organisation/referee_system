from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from competition.models import Accommodation
from competition.models import Application
from competition.models import Competition
from competition.models import CompetitionCategory
from competition.models import Event
from competition.models import Invitation
from helper.serializers import LocationSerializer


class AccommodationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Accommodation
        fields = ["id", "event", "name", "start", "end", "address", "info", "type"]
        validators = [
            UniqueTogetherValidator(
                Accommodation.objects.all(),
                fields=["name", "event"],
                message="The accommodation name must be unique for each event.",
            )
        ]


class ApplicationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Application
        fields = [
            "id",
            "user",
            "created",
            "modified",
            "accommodation",
            "accommodation_arrival",
            "accommodation_departure",
            "accommodation_remark",
            "competition",
            "status",
            "role",
        ]
        read_only_fields = ["created", "modified"]
        validators = [
            UniqueTogetherValidator(
                queryset=Application.objects.all(),
                fields=["user", "competition"],
                message="There must not be more than one application for an event per "
                "referee.",
            )
        ]


class OwnApplicationSerializer(ApplicationSerializer):
    """
    Application as seen by the applying referee: status and role are set by
    the competition admins only.
    """

    class Meta(ApplicationSerializer.Meta):
        read_only_fields = [
            *ApplicationSerializer.Meta.read_only_fields,
            "status",
            "role",
        ]


class CompetitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Competition
        fields = [
            "id",
            "event",
            "invitor",
            "minimum_level",
            "desired_level",
            "start",
            "duration",
            "competition_fields",
            "category",
            "info",
            "head_referee",
            "referees",
            "observers",
            "application",
            "application_open",
            "application_close",
            "created",
            "modified",
        ]
        read_only_fields = ["created", "modified"]


class CompetitionCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = CompetitionCategory
        fields = ["id", "name", "parent"]


class EventSerializer(serializers.ModelSerializer):
    location = LocationSerializer(many=False, read_only=True)
    competitions = CompetitionSerializer(many=True, read_only=True)

    class Meta:
        model = Event
        fields = [
            "id",
            "name",
            "location",
            "competitions",
            "start",
            "end",
            "created",
            "modified",
            "creator",
            "info",
            "slug",
            "accommodations",
        ]
        read_only_fields = ["created", "modified", "creator"]
        # DRF's UniqueForYearValidator makes slug and start required even on
        # partial updates, so uniqueness is checked in validate() instead.
        validators = []

    def validate(self, attrs):
        attrs = super().validate(attrs)
        slug = attrs.get("slug", getattr(self.instance, "slug", None))
        start = attrs.get("start", getattr(self.instance, "start", None))
        if slug is not None and start is not None:
            clashes = Event.objects.filter(slug=slug, start__year=start.year)
            if self.instance is not None:
                clashes = clashes.exclude(pk=self.instance.pk)
            if clashes.exists():
                raise serializers.ValidationError(
                    {"slug": "Slug must be unique for each calendar year."}
                )
        return attrs


class EventOverviewSerializer(serializers.ModelSerializer):
    location = LocationSerializer(many=False, read_only=True)

    class Meta:
        model = Event
        fields = [
            "id",
            "name",
            "location",
            "start",
            "end",
        ]


class CompetitionOverviewSerializer(serializers.ModelSerializer):
    event = EventOverviewSerializer(many=False, read_only=True)

    class Meta:
        model = Competition
        fields = [
            "id",
            "event",
            "start",
            "info",
        ]


class InvitationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invitation
        fields = [
            "id",
            "competition",
            "previous_invitation",
            "invited",
            "send_copy",
            "subject",
            "message",
            "created",
            "sent",
        ]
        read_only_fields = ["created", "sent", "previous_invitation"]
