from django.contrib.auth.models import Group
from django.contrib.auth.models import User
from django.core.validators import MaxValueValidator
from django.core.validators import MinValueValidator
from django.db import models
from django.urls import reverse
from django.utils import timezone
from django.utils.text import slugify
from django.utils.translation import gettext_lazy as _

from helper.models import Address
from helper.models import Category
from helper.models import Location
from referee.models import Referee
from referee.models import RefereeLicense
from referee.models import RefereeRole


class CompetitionCategory(Category):
    """
    Category of a competition. Members of the `admins` group manage
    competitions of this category; members of the `observers` group may view
    them and their applications. Members of any of the three groups may apply.
    """

    members = models.ForeignKey(
        Group,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="member_categories",
        verbose_name=_("Member group"),
    )
    admins = models.ForeignKey(
        Group,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="administered_categories",
        verbose_name=_("Admin group"),
    )
    observers = models.ForeignKey(
        Group,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="observed_categories",
        verbose_name=_("Observer group"),
    )

    class Meta:
        verbose_name = _("Competition CAtegory")
        verbose_name_plural = _("Competition Categories")


class Event(models.Model):
    """
    Event class to store event details
    """

    name = models.CharField(max_length=240, verbose_name=_("Name"))
    location = models.ForeignKey(Location, on_delete=models.PROTECT)
    start = models.DateTimeField()
    end = models.DateTimeField(blank=True, null=True, default=None)
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    creator = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="event_created",
    )
    info = models.TextField(verbose_name=_("Information"), blank=True)
    slug = models.SlugField(unique_for_year="start")

    class Meta:
        ordering = ["start", "end", "name"]
        verbose_name = _("Event")
        verbose_name_plural = _("Events")

    def __str__(self) -> str:
        """
        Return the name as the string representation.
        """
        return f"{self.name}"

    def get_absolute_url(self):
        return reverse(
            "event-detail", kwargs={"year": self.start.year, "slug": self.slug}
        )

    @classmethod
    def create(cls, name: str, start: timezone.datetime, **kwargs):
        slug = kwargs.pop("slug", None) or slugify(name)
        qs = Event.objects.filter(slug=slug).filter(start__year=start.year)
        if qs.count() > 0:
            slug += f"-{qs.count()}"
        return Event.objects.create(name=name, start=start, slug=slug, **kwargs)

    @property
    def date(self) -> str:
        if self.end is None:
            return f"{self.start:%d %b %Y}"
        return f"{self.start:%d %b %Y} - {self.end:%d %b %Y}"


class Competition(models.Model):
    event = models.ForeignKey(
        Event,
        related_name="competitions",
        on_delete=models.CASCADE,
    )
    invitor = models.ForeignKey(Referee, on_delete=models.PROTECT)
    minimum_level = models.ForeignKey(
        RefereeLicense,
        on_delete=models.PROTECT,
        related_name="+",
        null=True,
        blank=True,
        verbose_name=_("Minimum license"),
        help_text=_("Leave empty to also accept candidates without a license."),
    )
    desired_level = models.ForeignKey(
        RefereeLicense,
        on_delete=models.PROTECT,
        related_name="+",
    )
    start = models.DateTimeField()
    duration = models.DurationField()
    competition_fields = models.IntegerField(
        validators=[MaxValueValidator(25), MinValueValidator(1)],
        blank=True,
        null=True,
    )
    category = models.ManyToManyField(CompetitionCategory, verbose_name=_("Category"))
    info = models.TextField(verbose_name=_("Information"), blank=True)
    head_referee = models.ForeignKey(
        Referee,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="+",
    )
    referees = models.IntegerField(
        verbose_name=_("Number of Referees"),
        validators=[MinValueValidator(1), MaxValueValidator(100)],
        blank=True,
        null=True,
    )
    observers = models.IntegerField(
        verbose_name=_("Number of Observers"),
        validators=[MinValueValidator(1), MaxValueValidator(25)],
        blank=True,
        null=True,
    )
    application_open = models.DateTimeField(
        verbose_name=_("Registration Open"), blank=True, null=True
    )
    application_close = models.DateTimeField(
        verbose_name=_("Registration Close"), blank=True, null=True
    )
    application = models.BooleanField(
        verbose_name=_("Allow Registration"), default=True
    )
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start", "referees"]
        verbose_name = _("Competition")
        verbose_name_plural = _("Competitions")

    def __str__(self) -> str:
        """
        Return the name of the associated event and the date as the string
        representation.
        """
        return f"{self.event.name} ({self.start.date()})"

    @property
    def registration_closes(self) -> timezone.datetime:
        """
        End of the registration period: the closing date if one is set,
        otherwise the start of the competition.
        """
        return self.application_close or self.start

    def registration_open(self) -> bool:
        """
        Check if registration is currently open. Without an opening date it is
        open right away; without a closing date it stays open until the
        competition starts.
        """
        if not self.application:
            return False
        now = timezone.now()
        if self.application_open is not None and now < self.application_open:
            return False
        return now <= self.registration_closes

    def is_eligible(self, user: Referee) -> bool:
        """
        Check if the referee holds the minimum license or a higher one.
        Without a minimum license everyone is eligible, also candidates who
        don't have a license yet.
        """
        if self.minimum_level is None:
            return True
        return user.is_qualified(self.minimum_level)

    def application_allowed(self, user: Referee | None = None) -> bool:
        """
        Check if application is currently possible, for the given referee if
        one is given.
        """
        if not self.registration_open():
            return False
        return user is None or self.is_eligible(user)


class Accommodation(models.Model):
    class RoomType(models.IntegerChoices):
        PRIVATE = 0, _("Private")
        SINGLE_S = 1, _("Single room (surcharge)")
        DOUBLE = 2, _("Double room")
        TIRPLE = 3, _("Triple room")
        SINGLE = 10, _("Single room")
        DORM = 11, _("Dorm")

    event = models.ForeignKey(
        Event, on_delete=models.CASCADE, related_name="accommodations"
    )
    name = models.CharField(max_length=240, verbose_name=_("Name of Accommodation"))
    start = models.DateTimeField(
        blank=True, null=True, verbose_name=_("Earliest Check-in")
    )
    end = models.DateTimeField(blank=True, null=True, verbose_name=_("Lates Check-out"))
    type = models.IntegerField(
        verbose_name=_("Room Type"),
        choices=RoomType,
        default=RoomType.DOUBLE,
    )
    info = models.TextField(verbose_name=_("Information"), blank=True)
    address = models.ForeignKey(Address, on_delete=models.PROTECT)

    class Meta:
        ordering = ["start", "end", "name"]
        verbose_name = _("Accommodation")
        verbose_name_plural = _("Accommodations")

    def __str__(self) -> str:
        return self.name


class Application(models.Model):
    class Status(models.IntegerChoices):
        NOSHOW = -4, _("No Show")
        DECLINED = -3, _("Declined")
        CANCELLED = -2, _("Cancelled")
        NOTSELECTED = -1, _("Not selected")
        APPLIED = 0, _("Applied")
        SELECTED = 1, _("Selected")
        INVITED = 2, _("Invited")
        PARTICIPATED = 3, _("Participated")

    user = models.ForeignKey(Referee, on_delete=models.CASCADE)
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    accommodation = models.ForeignKey(
        Accommodation, on_delete=models.PROTECT, blank=True, null=True
    )
    accommodation_arrival = models.DateField(
        verbose_name=_("Arrival Day"), blank=True, null=True
    )
    accommodation_departure = models.DateField(
        verbose_name=_("Departure Day"), blank=True, null=True
    )
    accommodation_remark = models.TextField(verbose_name=_("Information"), blank=True)
    competition = models.ForeignKey(
        Competition,
        on_delete=models.PROTECT,
        related_name="applications",
    )
    status = models.IntegerField(choices=Status, default=Status.APPLIED)
    role = models.ForeignKey(
        RefereeRole,
        on_delete=models.PROTECT,
        blank=True,
        null=True,
        related_name="+",
    )

    class Meta:
        order_with_respect_to = "user"
        verbose_name = _("Application")
        verbose_name_plural = _("Applications")

    def __str__(self):
        return (
            f"Application: {self.competition.event.name} "
            f"({self.competition.start.date()}) by {self.user.name}"
        )


class Invitation(models.Model):
    """
    Invitation of referees to a competition, prepared and sent by its
    invitor. An invitation is a draft until it is sent. Changes after
    sending go into a new invitation that points to the one sent before.
    """

    competition = models.ForeignKey(
        Competition,
        verbose_name=_("Competition"),
        on_delete=models.CASCADE,
        related_name="invitations",
        blank=True,
        null=True,
    )
    previous_invitation = models.OneToOneField(
        "self",
        on_delete=models.SET_NULL,
        verbose_name=_("previous invitation"),
        blank=True,
        null=True,
        related_name="updated_invitation",
        related_query_name="update",
    )
    invited = models.ManyToManyField(
        Application,
        verbose_name=_("Invited"),
        related_name="invitation",
        related_query_name="invitation",
        blank=True,
    )
    head_referee = models.ForeignKey(
        Referee,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="+",
        verbose_name=_("Head referee"),
    )
    send_copy = models.ManyToManyField(User, blank=True)
    subject = models.CharField(max_length=240)
    message = models.TextField(blank=True)
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    sent = models.DateTimeField(blank=True, null=True)
    sender = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        blank=True,
        null=True,
        related_name="+",
        verbose_name=_("Sent by"),
    )

    class Meta:
        ordering = ["created", "sent"]

    def __str__(self) -> str:
        return f"Invitation {self.pk}: {self.subject}"

    @property
    def is_sent(self) -> bool:
        return self.sent is not None
