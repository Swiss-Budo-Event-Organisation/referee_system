import { ReactNode, useCallback, useRef, useState } from "react";
import { AllauthResponse, Flow, needsReauthentication } from "../../../lib/allauth";
import ReauthModal from "../components/ReauthModal";

/**
 * Runs allauth calls that may need the user to confirm it is them. When
 * allauth asks for that, the dialog opens and the call is repeated once the
 * user has confirmed. Render `dialog` somewhere in the component.
 */
export function useReauth(): {
    withReauth: <T>(action: () => Promise<AllauthResponse<T>>) => Promise<AllauthResponse<T>>;
    dialog: ReactNode;
} {
    const [flows, setFlows] = useState<Flow[] | null>(null);
    const resolve = useRef<((confirmed: boolean) => void) | null>(null);

    const withReauth = useCallback(async <T,>(action: () => Promise<AllauthResponse<T>>) => {
        const res = await action();
        const needed = needsReauthentication(res);
        if (!needed) return res;
        const confirmed = await new Promise<boolean>((done) => {
            resolve.current = done;
            setFlows(needed);
        });
        setFlows(null);
        resolve.current = null;
        return confirmed ? action() : res;
    }, []);

    const dialog = flows ? <ReauthModal flows={flows} onDone={(ok) => resolve.current?.(ok)} /> : null;
    return { withReauth, dialog };
}
