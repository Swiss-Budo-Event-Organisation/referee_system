import { Navigate } from "react-router-dom";
import OnboardingForm from "../features/Accounts/components/OnboardingForm";
import { getUser } from "../lib/auth";

function Onboarding() {
    const pk = getUser();
    if (pk === undefined) return <Navigate to="/login" />;
    return <OnboardingForm pk={pk} />;
}

export default Onboarding;
