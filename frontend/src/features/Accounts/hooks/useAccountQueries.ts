import { useQuery } from "@tanstack/react-query";
import { getGroups, getPendingAccounts } from "../utils/Accounts";

export function usePendingAccountsQuery(enabled: boolean) {
    return useQuery({
        queryKey: ["accounts", "pending"],
        queryFn: (obj) => getPendingAccounts(obj.signal),
        enabled,
    });
}

export function useGroupsQuery(enabled: boolean) {
    return useQuery({
        queryKey: ["accounts", "groups"],
        queryFn: (obj) => getGroups(obj.signal),
        enabled,
        staleTime: 1000 * 60 * 10,
    });
}
