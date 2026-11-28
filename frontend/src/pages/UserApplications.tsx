import { useContext } from "react";
import NotFound from "./NotFound";
import ApplicationsList from "../features/User/components/ApplicationsCard";
import { UserContext } from "../layouts/UserContext";

function UserApplications() {
    const { user } = useContext(UserContext);
    if (user.id === undefined) return <NotFound />
    return (
        <>
            <h1 className="mb-4">My Applications</h1>
            <ApplicationsList user={user.id} />
        </>
    );
}

export default UserApplications
