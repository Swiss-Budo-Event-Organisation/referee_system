import axios from "axios";
import { refreshToken, validToken } from "./auth";

export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL
})

const requestPending = new Map();

api.interceptors.request.use(
    async (config) => {
        const requestID = `${config.url}_${config.method}`;
        if (requestPending.has(requestID)) {
            const controller = requestPending.get(requestID);
            controller.abort();
        }
        const controller = new AbortController();
        config.signal = controller.signal;
        requestPending.set(requestID, controller);
        const token = await validToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config
    },
    (error) => {
        const requestID = `${error.config.url}_${error.config.method}`;
        requestPending.delete(requestID)
        return Promise.reject(error)
    }
)

api.interceptors.response.use(
    (response) => {
        const requestID = `${response.config.url}_${response.config.method}`;
        requestPending.delete(requestID);
        return response
    }, async (error) => {
        const config = error.config;
        if (config) {
            requestPending.delete(`${config.url}_${config.method}`);
        }
        // The access token may have been rejected before it expired, e.g.
        // after a restart of the server. Try once more with a fresh one.
        if (config && error.response?.status === 401 && !config._retried) {
            config._retried = true;
            const token = await refreshToken();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
                return api.request(config);
            }
        }
        return Promise.reject(error);
    }
)

export async function getRequest(url: string, signal: AbortSignal) {
    return api.get(url, { signal })
        .then((res) => res.data)
}

export default api
