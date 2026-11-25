import { useState } from "react"
import { Stack } from "react-bootstrap"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "react-toastify"
import LoadingIndicator from "../../../components/LoadingIndicator"
import { useAddressQuery } from "../../../hooks/useQueries"
import { createPersonalAddress, updateAddress } from "../../../lib/requests"
import { AddressType } from "../../../lib/types"
import { useProfileQuery } from "../hooks/useUserQueries"
import ApplicationsList from "./ApplicationsCard"
import ExaminationCard from "./ExaminationCard"
import ProfileSection, { SectionField, SectionValues } from "./ProfileSection"
import EmailStatus from "../../Accounts/components/EmailStatus"
import { FieldErrors, NOTIFICATION_CHOICES, updateUser } from "../../Accounts/utils/Accounts"

const PERSONAL: SectionField[] = [
    { name: "first_name", label: "First name", required: true, autoComplete: "given-name", md: 6 },
    { name: "last_name", label: "Last name", required: true, autoComplete: "family-name", md: 6 },
    { name: "dob", label: "Date of birth", type: "date", autoComplete: "bday", md: 6 },
];

const ADDRESS: SectionField[] = [
    { name: "street", label: "Street", autoComplete: "address-line1", md: 8 },
    { name: "house_number", label: "House number", autoComplete: "off", md: 4 },
    { name: "area_code", label: "Postal code", autoComplete: "postal-code", md: 4 },
    { name: "city", label: "City", autoComplete: "address-level2", md: 8 },
    { name: "country", label: "Country", autoComplete: "country-name" },
];

const BANK: SectionField[] = [
    { name: "iban", label: "IBAN", help: "Only staff members and the invitors of your competitions see it." },
];

const SHARING: SectionField[] = [
    { name: "share_email", label: "My e-mail address", type: "switch" },
    { name: "share_phone", label: "My phone number", type: "switch" },
    { name: "share_mobile", label: "My mobile phone number", type: "switch" },
    { name: "share_dob", label: "My date of birth", type: "switch" },
    { name: "share_address", label: "My address", type: "switch" },
];

const NOTIFICATIONS: SectionField[] = [
    {
        name: "approval_notifications", label: "E-mail me when accounts await approval", type: "select",
        options: NOTIFICATION_CHOICES,
        help: "The e-mail only says how many accounts are waiting, without names.",
    },
];

/** The address is optional, but once begun it needs a street and a city. */
function validateAddress(values: SectionValues): FieldErrors {
    if (!Object.values(values).some(Boolean)) return {};
    return Object.fromEntries(
        ["street", "city"].filter((name) => !values[name]).map((name) => [name, ["This field is required."]]),
    );
}

function ProfilePage({ pk }: { pk: number }) {
    const queryClient = useQueryClient();
    const profileQuery = useProfileQuery(pk);
    // The section being edited: one at a time.
    const [editing, setEditing] = useState<string | null>(null);
    const addressId: number | undefined = profileQuery.data?.referee?.address ?? undefined;
    const addressQuery = useAddressQuery(addressId as number, addressId != null);
    if (profileQuery.isLoading || profileQuery.data == null || addressQuery.isLoading) {
        return <LoadingIndicator size="15rem" />
    }
    const data = profileQuery.data;
    const referee = data.referee ?? {};
    const address: Partial<AddressType> = addressQuery.data ?? {};

    async function refresh() {
        await queryClient.invalidateQueries({ queryKey: ["profile"] });
        await queryClient.invalidateQueries({ queryKey: ["address"] });
    }

    async function save(user: object, refereeData?: object) {
        await updateUser(pk, refereeData ? { ...user, referee: refereeData } : user);
        await refresh();
    }

    async function saveAddress(values: SectionValues) {
        const fields = values as AddressType;
        if (!Object.values(values).some(Boolean)) {
            // Removing the address deletes it.
            if (addressId != null) await updateUser(pk, { referee: { address: null } });
        } else if (addressId != null) {
            await updateAddress(addressId, fields);
        } else {
            await createPersonalAddress(fields);
        }
        await refresh();
    }

    const email: SectionField = {
        name: "email", label: "E-mail address", type: "email", autoComplete: "email",
        help: "A new address needs to be confirmed again.",
        display: (value) => <EmailStatus email={String(value ?? "")} confirmed={Boolean(data.account?.email_confirmed)} />,
    };
    /** What every section needs to take part in editing one at a time. */
    function editable(title: string) {
        return {
            title,
            editing: editing === title,
            onEdit: () => {
                if (editing !== null && editing !== title) {
                    toast.warning(`Please save or cancel your changes to "${editing}" before editing "${title}".`,
                        { toastId: "one-section" });
                    return false;
                }
                setEditing(title);
                return true;
            },
            onDone: () => setEditing(null),
        };
    }

    const contact: SectionField[] = [
        email,
        { name: "phone", label: "Phone number", type: "tel", autoComplete: "tel", md: 6 },
        { name: "mobile", label: "Mobile phone number", type: "tel", autoComplete: "tel", md: 6 },
    ];

    return (
        <>
            <h2>{data.first_name} {data.last_name} ({data.username})</h2>
            <Stack gap={2}>
                <ProfileSection {...editable("Personal details")} fields={PERSONAL} defaultOpen
                    values={{ first_name: data.first_name, last_name: data.last_name, dob: referee.dob }}
                    onSave={({ first_name, last_name, dob }) => save({ first_name, last_name }, { dob: dob || null })} />
                <ProfileSection {...editable("Contact")} fields={contact}
                    values={{ email: data.email, phone: referee.phone, mobile: referee.mobile }}
                    onSave={({ email, phone, mobile }) => save({ email }, { phone, mobile })} />
                <ProfileSection {...editable("Address")} fields={ADDRESS} values={address} validate={validateAddress}
                    onSave={saveAddress}
                    summary={addressQuery.data != null ? (
                        <address className="mb-0">
                            {address.street} {address.house_number}<br />
                            {address.area_code} {address.city}<br />
                            {address.country}
                        </address>
                    ) : <span className="text-body-secondary">Not given</span>} />
                <ProfileSection {...editable("Bank details")} fields={BANK} values={{ iban: referee.iban }}
                    onSave={(values) => save({}, values)} />
                <ProfileSection {...editable("Visible to other users")} fields={SHARING}
                    values={Object.fromEntries(SHARING.map(({ name }) => [name, Boolean(referee[name])]))}
                    onSave={(values) => save({}, values)}
                    footer={<p className="text-body-secondary small mt-2 mb-0">
                        Your name is always visible to other users; nothing else is unless you allow it.
                    </p>} />
                {data.is_staff && (
                    <ProfileSection {...editable("Notifications")} fields={NOTIFICATIONS}
                        values={{ approval_notifications: data.account?.approval_notifications ?? "never" }}
                        onSave={(values) => save({ account: values })} />
                )}
                <ExaminationCard user={data.id} />
                <ApplicationsList user={data.id} />
            </Stack>
        </>
    )
}

export default ProfilePage
