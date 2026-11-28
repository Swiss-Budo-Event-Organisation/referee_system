from django.db import models
from django.utils.translation import gettext as _


def _list_items_as_string(*args):
    """
    Helper function returning a list of strings from *args
    """
    return [str(item) for item in args if item is not None and str(item) != ""]


class Address(models.Model):
    """
    Class to store a regular address
    composed of fields for street, house number, area code, city and country
    string representation gives comma separated concatenation

    An address a referee points to is that referee's personal address. It
    belongs to that referee alone: no other referee, location, accommodation
    or examination uses it, so changing it affects nobody else. Two referees
    living together each have their own copy. Any other address may be seen
    by all users.
    """

    street = models.CharField(max_length=150, verbose_name=_("Street"))
    house_number = models.CharField(
        max_length=10, verbose_name=_("House number"), default=""
    )
    area_code = models.CharField(
        max_length=15, verbose_name=_("Postal code"), default=""
    )
    city = models.CharField(max_length=180, verbose_name=_("City"))
    country = models.CharField(max_length=100, verbose_name=_("Country"), default="")

    class Meta:
        verbose_name = _("Address")
        verbose_name_plural = _("Addresses")
        ordering = ["country", "city", "street", "house_number"]

    def __str__(self):
        """
        return string of comma separated concatenation of fields
        """
        line = ", ".join(
            [
                " ".join(_list_items_as_string(self.street, self.house_number)),
                " ".join(_list_items_as_string(self.area_code, self.city)),
                self.country,
            ]
        )
        return line

    @property
    def is_personal(self) -> bool:
        """Whether a referee lives here."""
        return self.domiciled.exists()

    def is_used(self, except_referee=None) -> bool:
        """
        Whether a referee (other than except_referee), location,
        accommodation or examination uses the address.
        """
        referees = self.domiciled.all()
        if except_referee is not None:
            referees = referees.exclude(pk=except_referee.pk)
        return (
            referees.exists()
            or self.location_set.exists()
            or self.accommodation_set.exists()
            or self.exams.exists()
        )


class Location(models.Model):
    """
    Class to store a location as combination of a name, description and an
    instance of the previous address class.
    """

    name = models.CharField(max_length=50, verbose_name=_("Name"))
    description = models.TextField(verbose_name=_("Description"), default="")
    address = models.ForeignKey(
        Address, blank=True, null=True, on_delete=models.SET_NULL
    )

    class Meta:
        verbose_name = _("Location")
        verbose_name_plural = _("Locations")
        ordering = ["name"]

    def __str__(self):
        """
        return string representation as name
        """
        return self.name

    def with_address(self):
        """
        return string representation including the address, separedt by comma
        """
        return ", ".join(_list_items_as_string(self, self.address))


class Category(models.Model):
    name = models.CharField(max_length=50, unique=True, verbose_name=_("Name"))
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        default=None,
        related_name="children",
        null=True,
        blank=True,
        verbose_name=_("next higher category"),
    )

    class Meta:
        abstract = True
        verbose_name = _("Category")
        verbose_name_plural = _("Categories")

    def __str__(self) -> str:
        return self.name

    def __lt__(self, other: object) -> bool:
        return self.is_child_of(other)

    def __gt__(self, other: object) -> bool:
        return self.is_parent_of(other)

    def __le__(self, other: object) -> bool:
        return self < other or self == other

    def __ge__(self, other: object) -> bool:
        return self > other or self == other

    def is_parent_of(self, other: object) -> bool:
        if not isinstance(other, Category):
            raise TypeError(
                f"{other} is of type {type(other)} which cannot be compared with "
                f"{type(self)}."
            )
        if other.parent is None:
            return False
        if other.parent == self:
            return True
        return self.is_parent_of(other.parent)

    def is_child_of(self, other: object) -> bool:
        if not isinstance(other, Category):
            raise TypeError(
                f"{other} is of type {type(other)} which cannot be compared with "
                f"{type(self)}."
            )
        if self.parent is None:
            return False
        if self.parent == other:
            return True
        return self.parent.is_child_of(other)

    @property
    def level(self) -> int:
        value = 0
        obj = self
        while obj.parent is not None:
            value += 1
            obj = obj.parent
        return value
