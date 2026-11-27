import { Navigate, useSearchParams } from "react-router-dom"
import { useContext, useEffect } from "react";
import { UserContext } from "../layouts/MainLayout";
import { getUser } from "../lib/auth";
import LoginForm from "../features/Auth/components/LoginForm";

function Login() {
    const next = useSearchParams()[0].get("next");
    const { user, setUser } = useContext(UserContext);
    const userID = getUser();
    const loggedIn = userID !== undefined && user?.id === userID;
    // Marked as logged in once only: setting it on every render would loop.
    useEffect(() => {
        if (loggedIn && !user.isAuthenticated) setUser({ "id": userID, "isAuthenticated": true });
    }, [loggedIn, user.isAuthenticated, userID, setUser]);
    if (loggedIn) return <Navigate to={next ? next : "/events"} />
    return <LoginForm next={next} />
}

export default Login
