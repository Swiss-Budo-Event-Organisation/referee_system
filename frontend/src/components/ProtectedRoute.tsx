import { ReactNode, useContext, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { validToken } from "../lib/auth";
import LoadingIndicator from "./LoadingIndicator";
import { UserContext } from "../layouts/UserContext";
import { useProfileQuery } from "../features/User/hooks/useUserQueries";

/**
 * Pages for logged-in users. Users who have not completed the onboarding
 * yet are sent there first.
 */
function OnboardingGate({ pk, children }: { pk: number; children: ReactNode }) {
    const profile = useProfileQuery(pk);
    const location = useLocation();
    if (profile.isLoading) return <LoadingIndicator />;
    if (profile.data?.account?.onboarded === false && location.pathname !== "/onboarding") {
        return <Navigate to="/onboarding" replace />;
    }
    return children;
}

function ProtectedRoute({ children }: { children: ReactNode }) {
    const { user, setUser } = useContext(UserContext);

    useEffect(() => {
        // Logged out once the refresh token has expired or was revoked.
        validToken()
            .then((token) => { if (!token) setUser({ "id": undefined, "isAuthenticated": false }) })
            .catch(() => setUser({ "id": undefined, "isAuthenticated": false }))
    }, [setUser])

    if (user.isAuthenticated === undefined) {
        return <LoadingIndicator />
    }
    if (!user.isAuthenticated) return <Navigate to="/login" />;
    if (user.id === undefined) return children;
    return <OnboardingGate pk={user.id}>{children}</OnboardingGate>;
}

export default ProtectedRoute
