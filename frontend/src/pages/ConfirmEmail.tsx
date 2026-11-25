import { useSearchParams } from "react-router-dom";
import ConfirmEmail from "../features/Accounts/components/ConfirmEmail";
import { getUser } from "../lib/auth";

function ConfirmEmailPage() {
    const token = useSearchParams()[0].get("token");
    return <ConfirmEmail token={token} loggedIn={getUser() !== undefined} />;
}

export default ConfirmEmailPage;
