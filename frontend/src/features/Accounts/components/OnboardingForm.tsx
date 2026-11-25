import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Form, Row } from "react-bootstrap";
import FormField from "../../Events/components/FormField";
import LoadingIndicator from "../../../components/LoadingIndicator";
import { useProfileQuery } from "../../User/hooks/useUserQueries";
import { useAddressQuery } from "../../../hooks/useQueries";
import { createPersonalAddress, updateAddress } from "../../../lib/requests";
import { AddressType } from "../../../lib/types";
import { FieldErrors, fieldErrors, updateUser } from "../utils/Accounts";

const OPTIONAL: { name: string; label: string; type: string; autoComplete?: string }[] = [
    { name: "phone", label: "Phone number", type: "tel", autoComplete: "tel" },
    { name: "mobile", label: "Mobile phone number", type: "tel", autoComplete: "tel" },
    { name: "dob", label: "Date of birth", type: "date", autoComplete: "bday" },
    { name: "iban", label: "IBAN", type: "text" },
];

const SHARING: { name: string; label: string }[] = [
    { name: "share_email", label: "My e-mail address" },
    { name: "share_phone", label: "My phone number" },
    { name: "share_mobile", label: "My mobile phone number" },
    { name: "share_dob", label: "My date of birth" },
    { name: "share_address", label: "My address" },
];

const ADDRESS: { name: keyof AddressType; label: string; md: number; autoComplete: string; required?: boolean }[] = [
    { name: "street", label: "Street", md: 8, autoComplete: "address-line1", required: true },
    { name: "house_number", label: "House number", md: 4, autoComplete: "off" },
    { name: "area_code", label: "Postal code", md: 4, autoComplete: "postal-code" },
    { name: "city", label: "City", md: 8, autoComplete: "address-level2", required: true },
    { name: "country", label: "Country", md: 12, autoComplete: "country-name" },
];

/**
 * The first step after the first login: the name is required, everything
 * else may be left empty and added later.
 */
function OnboardingForm({ pk }: { pk: number }) {
    const profile = useProfileQuery(pk);
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [errors, setErrors] = useState<FieldErrors>({});
    const [saving, setSaving] = useState(false);
    const addressId: number | undefined = profile.data?.referee?.address ?? undefined;
    const address = useAddressQuery(addressId as number, addressId != null);

    if (profile.isLoading || profile.data == null || address.isLoading) return <LoadingIndicator size="15rem" />;
    const data = profile.data;
    const referee = data.referee ?? {};
    const current: Partial<AddressType> = address.data ?? {};

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const text = (name: string) => String(form.get(name) ?? "").trim();
        const required = { first_name: text("first_name"), last_name: text("last_name") };
        const addressData = Object.fromEntries(ADDRESS.map(({ name }) => [name, text(name)])) as AddressType;
        // The address is optional, but once begun it needs a street and a city.
        const hasAddress = Object.values(addressData).some(Boolean);
        const missing = [
            ...Object.entries(required),
            ...(hasAddress ? ADDRESS.filter((field) => field.required).map(({ name }) => [name, addressData[name]]) : []),
        ].filter(([, value]) => !value);
        if (missing.length) {
            setErrors(Object.fromEntries(missing.map(([name]) => [name, ["This field is required."]])));
            return;
        }
        const refereeData: Record<string, string | boolean | null> = {};
        for (const { name } of OPTIONAL) refereeData[name] = text(name);
        refereeData.dob = refereeData.dob || null;
        for (const { name } of SHARING) refereeData[name] = form.get(name) === "on";
        setSaving(true);
        try {
            if (hasAddress) {
                if (addressId != null) await updateAddress(addressId, addressData);
                else await createPersonalAddress(addressData);
            }
            await updateUser(pk, { ...required, referee: refereeData, onboarded: true });
            await queryClient.invalidateQueries({ queryKey: ["profile"] });
            await queryClient.invalidateQueries({ queryKey: ["address"] });
            navigate("/events");
        } catch (error) {
            setErrors(fieldErrors(error));
        } finally {
            setSaving(false);
        }
    }

    return (
        <>
            <h1>Welcome{data.first_name ? `, ${data.first_name}` : ""}</h1>
            <p className="text-body-secondary">
                Please check your name. Everything else is optional: fill in what you like now and change it
                any time on your profile.
            </p>
            <Form onSubmit={handleSubmit} noValidate>
                {errors.general?.map((message) => <Alert key={message} variant="danger">{message}</Alert>)}
                <Row xs={1} md={2}>
                    <FormField id="onboarding-first_name" label="First name" errors={errors.first_name} required>
                        <Form.Control name="first_name" defaultValue={data.first_name} autoComplete="given-name"
                            required isInvalid={Boolean(errors.first_name)} disabled={saving} />
                    </FormField>
                    <FormField id="onboarding-last_name" label="Last name" errors={errors.last_name} required>
                        <Form.Control name="last_name" defaultValue={data.last_name} autoComplete="family-name"
                            required isInvalid={Boolean(errors.last_name)} disabled={saving} />
                    </FormField>
                    {OPTIONAL.map(({ name, label, type, autoComplete }) => (
                        <FormField key={name} id={`onboarding-${name}`} label={label} errors={errors[name]}
                            help={name === "iban" ? "Only staff members and the invitors of your competitions see it." : undefined}>
                            <Form.Control name={name} type={type} autoComplete={autoComplete}
                                defaultValue={referee[name] ?? ""} isInvalid={Boolean(errors[name])} disabled={saving} />
                        </FormField>
                    ))}
                </Row>
                <fieldset className="mb-3">
                    <legend className="h6">Address</legend>
                    <Row>
                        {ADDRESS.map(({ name, label, md, autoComplete, required }) => (
                            <FormField key={name} id={`onboarding-${name}`} label={label} md={md} errors={errors[name]}>
                                <Form.Control name={name} autoComplete={autoComplete} defaultValue={current[name] ?? ""}
                                    required={required} isInvalid={Boolean(errors[name])} disabled={saving} />
                            </FormField>
                        ))}
                    </Row>
                    <Form.Text muted>Optional. If you give an address, street and city are needed.</Form.Text>
                </fieldset>
                <fieldset className="mb-3">
                    <legend className="h6">Other users may see</legend>
                    {SHARING.map(({ name, label }) => (
                        <Form.Check key={name} type="switch" id={`onboarding-${name}`} name={name} label={label}
                            defaultChecked={Boolean(referee[name])} disabled={saving} />
                    ))}
                    <Form.Text muted>Your name is always visible to other users; nothing else is unless you allow it.</Form.Text>
                </fieldset>
                {saving ? <LoadingIndicator center={false} /> : <Button type="submit">Save and continue</Button>}
            </Form>
        </>
    );
}

export default OnboardingForm;
