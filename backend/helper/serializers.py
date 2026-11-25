from rest_framework import serializers

from helper.models import Address
from helper.models import Location


def public_address(address):
    """Validate that the address is not a referee's personal address."""
    if address is not None and address.is_personal:
        raise serializers.ValidationError("This is a personal address.")
    return address


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = ["id", "street", "house_number", "area_code", "city", "country"]


class NewAddressSerializer(AddressSerializer):
    """
    A new address. A personal one becomes the requester's own address,
    replacing their previous one; any other is public.
    """

    personal = serializers.BooleanField(default=True, write_only=True)

    class Meta(AddressSerializer.Meta):
        fields = [*AddressSerializer.Meta.fields, "personal"]


class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ["id", "name", "description", "address"]

    def create(self, validated_data):
        address_data = validated_data.pop("address")
        # Reuse a matching address, but never a referee's personal one.
        address = Address.objects.filter(domiciled=None, **address_data).first()
        if address is None:
            address = Address.objects.create(**address_data)
        location = Location.objects.create(address=address, **validated_data)
        return location

    def update(self, instance, validated_data):
        loc_id = validated_data.pop("id")
        address_data = validated_data.pop("address")
        add_id = address_data.pop("id")
        address = (  # noqa: F841
            Address.objects.filter(pk=add_id).select_for_update().update(**address_data)
        )
        location = (  # noqa: F841
            Location.objects.filter(pk=loc_id)
            .select_for_update()
            .update(**validated_data)
        )
