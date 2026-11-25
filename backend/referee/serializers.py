from rest_framework import serializers

from referee.models import Examination
from referee.models import Referee
from referee.models import RefereeLicense
from referee.models import RefereeRole


class ExaminationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Examination
        fields = [
            "id",
            "candidate",
            "license",
            "chief_examiner",
            "date",
            "address",
            "grade",
            "passed",
            "note_internal",
            "note_external",
        ]


class OwnExaminationSerializer(serializers.ModelSerializer):
    """
    An examination as its candidate sees it, without the internal note
    meant for the examination committee.
    """

    class Meta:
        model = Examination
        fields = [
            "id",
            "candidate",
            "license",
            "chief_examiner",
            "date",
            "address",
            "grade",
            "passed",
            "note_external",
        ]
        read_only_fields = fields


class RefereeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Referee
        fields = [
            "id",
            "address",
            "dob",
            "iban",
            "phone",
            "mobile",
            "share_email",
            "share_phone",
            "share_mobile",
            "share_address",
        ]
        read_only_fields = ["id"]


class RefereeLicenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = RefereeLicense
        fields = ["id", "name", "parent"]


class RefereeRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = RefereeRole
        fields = ["id", "name", "order"]


class RefereeOptionSerializer(serializers.ModelSerializer):
    """
    Just enough of a referee to pick them in a form.
    """

    name = serializers.CharField(read_only=True)

    class Meta:
        model = Referee
        fields = ["id", "user", "name"]
