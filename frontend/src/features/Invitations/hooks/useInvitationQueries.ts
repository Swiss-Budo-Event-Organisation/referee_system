import { useQuery } from "@tanstack/react-query";
import { getInvitation } from "../utils/Invitation";

export function useInvitationQuery(competition: number) {
    // Always fresh: the form starts from what is saved now.
    return useQuery({
        queryKey: ["competition", competition, "invitation"],
        queryFn: (obj) => getInvitation(competition, obj.signal),
        gcTime: 0,
    });
}
