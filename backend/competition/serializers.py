from django.db import transaction
from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from competition.models import Accommodation
from competition.models import Application
from competition.models import Competition
from competition.models import CompetitionCategory
from competition.models import Event
from competition.models import Invitation
from helper.models import Address
from helper.models import Location
from helper.serializers import AddressSerializer
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


class NewLocationSerializer(serializers.ModelSerializer):
    address = AddressSerializer()

    class Meta:
        model = Location
        fields = ["name", "description", "address"]
        extra_kwargs = {"description": {"required": False, "allow_blank": True}}


class NestedCompetitionSerializer(serializers.ModelSerializer):
    """
    A competition (tournament day) created together with its event.
    """

    category = serializers.PrimaryKeyRelatedField(
        queryset=CompetitionCategory.objects.all(), many=True, allow_empty=False
    )

    class Meta:
        model = Competition
        fields = [
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
        ]

    def validate(self, attrs):
        attrs = super().validate(attrs)
        opens = attrs.get("application_open")
        closes = attrs.get("application_close")
        if opens is not None and closes is not None and opens > closes:
            raise serializers.ValidationError(
                {"application_close": "Registration must close after it opens."}
            )
        if closes is not None and closes > attrs["start"]:
            raise serializers.ValidationError(
                {"application_close": "Registration must close before the start."}
            )
        if attrs["duration"].total_seconds() <= 0:
            raise serializers.ValidationError(
                {"duration": "The duration must be positive."}
            )
        return attrs


class EventCreateSerializer(serializers.ModelSerializer):
    """
    Create an event together with all its competitions in one request.

    The location is either an existing one (`location`) or a new one
    (`new_location`). Start and end of the event are taken from its
    competitions.
    """

    location = serializers.PrimaryKeyRelatedField(
        queryset=Location.objects.all(), required=False, allow_null=True
    )
    new_location = NewLocationSerializer(required=False, write_only=True)
    competitions = NestedCompetitionSerializer(many=True, allow_empty=False)

    class Meta:
        model = Event
        fields = [
            "id",
            "name",
            "location",
            "new_location",
            "info",
            "start",
            "end",
            "slug",
            "competitions",
        ]
        read_only_fields = ["start", "end", "slug"]
        extra_kwargs = {"info": {"required": False, "allow_blank": True}}
        # The slug is derived from the name and made unique in Event.create.
        validators = []

    def validate(self, attrs):
        attrs = super().validate(attrs)
        has_existing = attrs.get("location") is not None
        has_new = attrs.get("new_location") is not None
        if has_existing == has_new:
            raise serializers.ValidationError(
                {"location": "Choose an existing location or enter a new one."}
            )
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        competitions = validated_data.pop("competitions")
        new_location = validated_data.pop("new_location", None)
        if new_location is not None:
            address = Address.objects.create(**new_location.pop("address"))
            validated_data["location"] = Location.objects.create(
                address=address, **new_location
            )
        start = min(c["start"] for c in competitions)
        end = max(c["start"] + c["duration"] for c in competitions)
        event = Event.create(start=start, end=end, **validated_data)
        for data in competitions:
            categories = data.pop("category")
            competition = Competition.objects.create(event=event, **data)
            competition.category.set(categories)
        return event

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["competitions"] = CompetitionSerializer(
            instance.competitions.all(), many=True
        ).data
        return data
