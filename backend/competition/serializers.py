from django.db import transaction
from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from competition.invitations import MANAGED
from competition.invitations import default_subject
from competition.invitations import draft
from competition.invitations import latest_sent
from competition.invitations import locked_referees
from competition.models import Accommodation
from competition.models import Application
from competition.models import Competition
from competition.models import CompetitionCategory
from competition.models import Event
from competition.permissions import can_invite
from helper.models import Address
from helper.models import Location
from helper.serializers import AddressSerializer
from helper.serializers import LocationSerializer
from referee.models import Referee


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


class EventApplicationSerializer(ApplicationSerializer):
    """
    Application as listed and added by the admins of an event. Admins may add
    an application for any referee, without the checks referees face when
    applying themselves. Only one application per referee and competition
    is possible, though.
    """

    name = serializers.CharField(source="user.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta(ApplicationSerializer.Meta):
        fields = [
            "id",
            "user",
            "name",
            "competition",
            "status",
            "status_display",
            "created",
        ]
        read_only_fields = ["created", "status"]

    def validate_competition(self, competition):
        event = self.context["event"]
        if competition.event_id != event.pk:
            raise serializers.ValidationError(
                "This competition does not belong to the event."
            )
        return competition


class EventApplicationStatusSerializer(serializers.ModelSerializer):
    """
    The status change admins of an event may make to an application: they
    may only set it to cancelled or declined.
    """

    REMOVED = [Application.Status.CANCELLED, Application.Status.DECLINED]

    status = serializers.ChoiceField(
        choices=[(s.value, s.label) for s in REMOVED],
    )

    class Meta:
        model = Application
        fields = ["status"]

    def to_representation(self, instance):
        return EventApplicationSerializer(instance, context=self.context).data


class CompetitionSerializer(serializers.ModelSerializer):
    can_invite = serializers.SerializerMethodField()

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
            "can_invite",
        ]
        read_only_fields = ["created", "modified"]

    def get_can_invite(self, competition) -> bool:
        """Whether the requesting user may prepare the invitation."""
        request = self.context.get("request")
        return request is not None and can_invite(request.user, competition)


class CompetitionCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = CompetitionCategory
        fields = ["id", "name", "parent"]


class EventSerializer(serializers.ModelSerializer):
    location = LocationSerializer(many=False, read_only=True)
    competitions = CompetitionSerializer(many=True, read_only=True)
    can_edit = serializers.SerializerMethodField()
    can_view_details = serializers.SerializerMethodField()

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
            "can_edit",
            "can_view_details",
        ]
        read_only_fields = ["created", "modified", "creator"]
        # DRF's UniqueForYearValidator makes slug and start required even on
        # partial updates, so uniqueness is checked in validate() instead.
        validators = []

    def _user_may(self, perm, event) -> bool:
        request = self.context.get("request")
        if request is None:
            return False
        return request.user.has_perm(perm, event)

    def get_can_edit(self, event) -> bool:
        """Whether the requesting user may edit the event."""
        return self._user_may("competition.change_event", event)

    def get_can_view_details(self, event) -> bool:
        """
        Whether the requesting user may see all details of the event,
        including its applications (observers, admins and staff).
        """
        return self._user_may("competition.view_event", event)

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


class InvitationFormSerializer(serializers.Serializer):
    """
    The invitation as prepared by the invitor: the referees to invite, who
    may or may not have applied, the head referee and the e-mail text.
    """

    referees = serializers.PrimaryKeyRelatedField(
        queryset=Referee.objects.all(), many=True
    )
    head_referee = serializers.PrimaryKeyRelatedField(
        queryset=Referee.objects.all(), allow_null=True, required=False
    )
    subject = serializers.CharField(max_length=240)
    message = serializers.CharField(allow_blank=True, required=False, default="")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        competition = self.context["competition"]
        referees = list(attrs["referees"])
        head_referee = attrs.get("head_referee")
        if head_referee is not None:
            referees.append(head_referee)
        locked = locked_referees(competition, referees)
        if locked:
            names = ", ".join(sorted(r.name for r in locked))
            raise serializers.ValidationError(
                {"referees": [f"These referees can't be invited: {names}."]}
            )
        if self.context.get("send"):
            if not referees:
                raise serializers.ValidationError(
                    {"referees": ["Select at least one referee."]}
                )
            if head_referee is None:
                raise serializers.ValidationError(
                    {"head_referee": ["Select the head referee."]}
                )
        return attrs


class InvitationApplicationSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    has_email = serializers.SerializerMethodField()
    selectable = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = [
            "id",
            "user",
            "name",
            "status",
            "status_display",
            "created",
            "has_email",
            "selectable",
        ]

    def get_has_email(self, application) -> bool:
        return bool(application.user.user.email)

    def get_selectable(self, application) -> bool:
        return application.status in MANAGED


def _invitation_data(invitation):
    if invitation is None:
        return None
    return {
        "id": invitation.pk,
        "subject": invitation.subject,
        "message": invitation.message,
        "referees": [a.user_id for a in invitation.invited.all()],
        "head_referee": invitation.head_referee_id,
        "created": invitation.created,
        "modified": invitation.modified,
        "sent": invitation.sent,
    }


def invitation_overview(competition):
    """
    What the invitation page shows: the competition, the draft (or the
    invitation sent last as starting point), the last sent invitation and
    all applications.
    """
    current = draft(competition)
    sent = latest_sent(competition)
    applications = competition.applications.select_related("user__user").order_by(
        "-status", "created"
    )
    if current is not None:
        invitation = _invitation_data(current)
    elif sent is not None:
        invitation = {**_invitation_data(sent), "id": None, "sent": None}
    else:
        invitation = {
            "id": None,
            "subject": default_subject(competition),
            "message": "",
            "referees": [
                a.user_id
                for a in applications
                if a.status in (Application.Status.SELECTED, Application.Status.INVITED)
            ],
            "head_referee": competition.head_referee_id,
            "created": None,
            "modified": None,
            "sent": None,
        }
    event = competition.event
    return {
        "competition": {
            "id": competition.pk,
            "event": event.pk,
            "event_name": event.name,
            "location": event.location.name,
            "start": competition.start,
            "end": competition.start + competition.duration,
            "info": competition.info,
            "invitor": competition.invitor_id,
            "head_referee": competition.head_referee_id,
            "referees": competition.referees,
        },
        "invitation": invitation,
        "last_sent": _invitation_data(sent),
        "applications": InvitationApplicationSerializer(applications, many=True).data,
    }


class NewLocationSerializer(serializers.ModelSerializer):
    address = AddressSerializer()

    class Meta:
        model = Location
        fields = ["name", "description", "address"]
        extra_kwargs = {"description": {"required": False, "allow_blank": True}}


class NestedCompetitionSerializer(serializers.ModelSerializer):
    """
    A competition (tournament day) saved together with its event. When
    editing an event, existing days carry their `id`; days without one are
    new.
    """

    id = serializers.IntegerField(required=False, allow_null=True)
    category = serializers.PrimaryKeyRelatedField(
        queryset=CompetitionCategory.objects.all(), many=True, allow_empty=False
    )

    class Meta:
        model = Competition
        fields = [
            "id",
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


class EventFormSerializer(serializers.ModelSerializer):
    """
    Create or edit an event together with all its competitions in one
    request.

    The location is either an existing one (`location`) or a new one
    (`new_location`). Start and end of the event are taken from its
    competitions. When editing, competitions missing from the request are
    deleted, unless someone applied for them.
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

    @staticmethod
    def _location(validated_data):
        new_location = validated_data.pop("new_location", None)
        if new_location is not None:
            address = Address.objects.create(**new_location.pop("address"))
            validated_data["location"] = Location.objects.create(
                address=address, **new_location
            )

    @staticmethod
    def _period(competitions):
        start = min(c["start"] for c in competitions)
        end = max(c["start"] + c["duration"] for c in competitions)
        return start, end

    @transaction.atomic
    def create(self, validated_data):
        competitions = validated_data.pop("competitions")
        self._location(validated_data)
        start, end = self._period(competitions)
        event = Event.create(start=start, end=end, **validated_data)
        for data in competitions:
            data.pop("id", None)
            categories = data.pop("category")
            competition = Competition.objects.create(event=event, **data)
            competition.category.set(categories)
        return event

    @transaction.atomic
    def update(self, instance, validated_data):
        competitions = validated_data.pop("competitions")
        self._location(validated_data)
        existing = {c.pk: c for c in instance.competitions.all()}
        ids = [c.get("id") for c in competitions if c.get("id") is not None]
        if any(pk not in existing for pk in ids) or len(ids) != len(set(ids)):
            raise serializers.ValidationError(
                {"competitions": ["A competition day does not belong to this event."]}
            )
        removed = [c for pk, c in existing.items() if pk not in ids]
        if any(c.applications.exists() for c in removed):
            raise serializers.ValidationError(
                {
                    "competitions": [
                        "A competition day with applications cannot be removed."
                    ]
                }
            )

        # The slug stays, so links to the event keep working.
        for field in ("name", "info", "location"):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.start, instance.end = self._period(competitions)
        instance.save()

        for competition in removed:
            competition.delete()
        for data in competitions:
            pk = data.pop("id", None)
            categories = data.pop("category")
            if pk is None:
                competition = Competition.objects.create(event=instance, **data)
            else:
                competition = existing[pk]
                for field, value in data.items():
                    setattr(competition, field, value)
                competition.save()
            competition.category.set(categories)
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["competitions"] = CompetitionSerializer(
            instance.competitions.all(), many=True
        ).data
        return data
