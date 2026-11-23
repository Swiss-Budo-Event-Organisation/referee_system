import { useQuery } from "@tanstack/react-query";
import { getCategories, getLocations, getReferees } from "../utils/EventForm";

const cache = { staleTime: 1000 * 60 * 10, gcTime: 1000 * 60 * 30 };

export function useLocationsQuery() {
    return useQuery({ queryKey: ["locations"], queryFn: (obj) => getLocations(obj.signal), ...cache });
}

export function useCategoriesQuery() {
    return useQuery({ queryKey: ["categories"], queryFn: (obj) => getCategories(obj.signal), ...cache });
}

export function useRefereesQuery() {
    return useQuery({ queryKey: ["referees"], queryFn: (obj) => getReferees(obj.signal), ...cache });
}
