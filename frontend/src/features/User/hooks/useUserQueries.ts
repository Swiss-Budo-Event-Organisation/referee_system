import { useQuery } from "@tanstack/react-query";
import { getUser } from "../../../lib/auth";
import { getApplications, getExaminations, getProfile } from "../utils/User";

export function useProfileQuery(pk: number) {
    return useQuery({
        queryKey: ["profile", pk],
        queryFn: (obj) => getProfile(pk, obj.signal),
        gcTime: 1000 * 60 * 30,
        staleTime: 1000 * 60 * 10,
    })
}
export function useApplicationQuery(user: number) {
    return useQuery({
        queryKey: ['registrations', 'user', user],
        queryFn: (obj) => getApplications(obj.signal),
        gcTime: 1000 * 60 * 10,
        staleTime: 1000 * 60 * 2,
    })
}
export function useExaminationQuery(user: number) {
    return useQuery({
        queryKey: ['examination', 'user', user],
        queryFn: (obj) => getExaminations(obj.signal),
        gcTime: 1000 * 60 * 30,
        staleTime: 1000 * 60 * 10,
    })
}

/**
 * Whether the logged-in user has a model permission such as
 * "competition.add_event". Undefined while the user is being loaded.
 */
export function useHasPermission(permission: string): boolean | undefined {
    const id = getUser();
    const query = useQuery({
        queryKey: ["profile", id],
        queryFn: (obj) => getProfile(id as number, obj.signal),
        enabled: id !== undefined,
        gcTime: 1000 * 60 * 30,
        staleTime: 1000 * 60 * 10,
    });
    if (id === undefined || query.isError) return false;
    if (query.data === undefined) return undefined;
    return (query.data.permissions ?? []).includes(permission);
}
