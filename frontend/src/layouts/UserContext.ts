import { createContext } from "react";
import { UserType } from "../lib/types";

type ContextProp = {
    user: UserType;
    setUser: CallableFunction;
    theme: string;
    toggleTheme: CallableFunction;
}
export const UserContext = createContext<ContextProp>({ "user": {}, "setUser": () => { }, "theme": "light", "toggleTheme": () => { } });
