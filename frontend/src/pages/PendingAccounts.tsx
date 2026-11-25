import { Navigate } from "react-router-dom";
import PendingAccounts from "../features/Accounts/components/PendingAccounts";
import { getUser } from "../lib/auth";

function PendingAccountsPage() {
    const pk = getUser();
    if (pk === undefined) return <Navigate to="/login" />;
    return <PendingAccounts pk={pk} />;
}

export default PendingAccountsPage;
