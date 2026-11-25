import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Alert } from "react-bootstrap";
import LoadingIndicator from "../../../components/LoadingIndicator";
import { confirmEmail, fieldErrors } from "../utils/Accounts";

type State = { status: "loading" } | { status: "done" } | { status: "failed"; message: string };

/** Confirms the e-mail address with the token from the link in an e-mail. */
function ConfirmEmail({ token, loggedIn }: { token: string | null; loggedIn: boolean }) {
    const [state, setState] = useState<State>(
        token ? { status: "loading" } : { status: "failed", message: "This link is incomplete." },
    );

    useEffect(() => {
        if (!token) return;
        let active = true;
        confirmEmail(token)
            .then(() => active && setState({ status: "done" }))
            .catch((error) => active && setState({
                status: "failed",
                message: fieldErrors(error).general?.[0] ?? "This link is invalid or has expired.",
            }));
        return () => { active = false; };
    }, [token]);

    const next = loggedIn ? <Link to="/events">Continue</Link> : <Link to="/login">Log in to complete your profile</Link>;
    return (
        <>
            <h1>Confirm your e-mail address</h1>
            {state.status === "loading" && <LoadingIndicator />}
            {state.status === "done" && (
                <>
                    <Alert variant="success">Your e-mail address is confirmed.</Alert>
                    {next}
                </>
            )}
            {state.status === "failed" && (
                <>
                    <Alert variant="warning">
                        {state.message} You can ask for a new link on your profile once you are logged in.
                    </Alert>
                    {next}
                </>
            )}
        </>
    );
}

export default ConfirmEmail;
