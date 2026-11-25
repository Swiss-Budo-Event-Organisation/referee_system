import { useQuery } from "@tanstack/react-query";
import {
    getCategories,
    getEditableEvent,
    getEventApplications,
    getLocations,
    getReferees,
} from "../utils/EventForm";

const cache = { staleTime: 1000 * 60 * 10, gcTime: 1000 * 60 * 30 };

export function useLocationsQuery() {
    return useQuery({ queryKey: ["locations"], queryFn: (obj) => getLocations(obj.signal), ...cache });
}

export function useCategoriesQuery() {
    return useQuery({ queryKey: ["categories"], queryFn: (obj) => getCategories(obj.signal), ...cache });
}

export function useRefereesQuery(enabled: boolean = true) {
    return useQuery({ queryKey: ["referees"], queryFn: (obj) => getReferees(obj.signal), enabled, ...cache });
}

export function useEditableEventQuery(pk: number) {
    // Always fresh: the form starts from what is saved now.
    return useQuery({ queryKey: ["event", pk, "edit"], queryFn: (obj) => getEditableEvent(pk, obj.signal), gcTime: 0 });
}

export function useEventApplicationsQuery(pk: number) {
    return useQuery({ queryKey: ["event", pk, "applications"], queryFn: (obj) => getEventApplications(pk, obj.signal) });
}
