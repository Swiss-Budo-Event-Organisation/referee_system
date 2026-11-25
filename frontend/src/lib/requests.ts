import api, { getRequest } from "./api";
import { AddressType } from "./types";


export async function getAddress(pk: number, signal: AbortSignal) {
    return getRequest(`/api/address/${pk}/`, signal);
}

/** Create the user's personal address, replacing their previous one. */
export async function createPersonalAddress(data: AddressType) {
    return api.post("/api/address/", { ...data, personal: true });
}

export async function updateAddress(pk: number, data: Partial<AddressType>) {
    return api.patch(`/api/address/${pk}/`, data);
}

export async function getLicenses(signal: AbortSignal) {
    return getRequest("api/licenses/", signal);
}
