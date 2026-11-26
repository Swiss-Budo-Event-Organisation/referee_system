import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getUser } from "../../../lib/auth";
import { getApplications, getExaminations, getProfile, getReceivedInvitation, HistoricSearchType } from "../utils/User";

export function useProfileQuery(pk: number) {
    return useQuery({
        queryKey: ["profile", pk],
        queryFn: (obj) => getProfile(pk, obj.signal),
        gcTime: 1000 * 60 * 30,
        staleTime: 1000 * 60 * 10,
    })
}
/**
 * The user's own applications, loaded a page at a time, the latest
 * competition first. With criteria, those the server finds for them, and
 * nothing is loaded while they are null.
 */
export function useApplicationQuery(user: number, criteria?: HistoricSearchType | null) {
    return useInfiniteQuery({
        queryKey: criteria === undefined ? ['registrations', 'user', user] : ['registrations', 'user', user, criteria],
        queryFn: (obj) => getApplications(obj.pageParam, obj.signal, criteria ?? undefined),
        enabled: criteria !== null,
        // Invalid criteria are not retried.
        retry: criteria ? false : 3,
        initialPageParam: 1,
        getNextPageParam: (last, pages) => last.next ? pages.length + 1 : undefined,
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

type CurrentUser = { permissions?: string[]; is_staff?: boolean };

/**
 * A fact about the logged-in user, false without one and undefined while
 * the user is being loaded.
 */
function useCurrentUser(read: (user: CurrentUser) => boolean): boolean | undefined {
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
    return read(query.data);
}

/** Whether the logged-in user has a model permission such as "competition.add_event". */
export function useHasPermission(permission: string): boolean | undefined {
    return useCurrentUser((user) => (user.permissions ?? []).includes(permission));
}

/** Whether the logged-in user is a staff member. */
export function useIsStaff(): boolean | undefined {
    return useCurrentUser((user) => Boolean(user.is_staff));
}

export const APPROVE_ACCOUNTS = "accounts.approve_account";
export const VIEW_ACCOUNTS = "accounts.view_account";

/** Whether the user may approve accounts, which includes seeing those awaiting approval. */
export function canApproveAccounts(user: CurrentUser): boolean {
    return (user.permissions ?? []).includes(APPROVE_ACCOUNTS);
}

/** Whether the user may see the accounts awaiting approval. */
export function canViewPendingAccounts(user: CurrentUser): boolean {
    return canApproveAccounts(user) || (user.permissions ?? []).includes(VIEW_ACCOUNTS);
}

export function useCanApproveAccounts(): boolean | undefined {
    return useCurrentUser(canApproveAccounts);
}

export function useCanViewPendingAccounts(): boolean | undefined {
    return useCurrentUser(canViewPendingAccounts);
}

/** The invitation of one of the user's applications, loaded once it is shown. */
export function useReceivedInvitationQuery(application: number, enabled: boolean) {
    return useQuery({
        queryKey: ["application", application, "invitation"],
        queryFn: (obj) => getReceivedInvitation(application, obj.signal),
        enabled,
        staleTime: 1000 * 60 * 2,
    })
}
