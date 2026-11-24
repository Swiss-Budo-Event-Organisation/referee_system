import { useParams } from "react-router-dom";
import InvitationView from "../features/Invitations/components/InvitationView";
import NotFound from "./NotFound";

/** The invitation of a competition, for its invitor. */
function CompetitionInvitation() {
    const { pk } = useParams();
    const id = Number(pk);
    if (!pk || !Number.isInteger(id)) return <NotFound />;
    return <InvitationView key={id} pk={id} />;
}

export default CompetitionInvitation;
