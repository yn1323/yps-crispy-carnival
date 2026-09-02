import { atom } from "jotai";

export type AuthenticatedUser = {
  authId: string;
  name: string;
  email: string;
};

export const EMPTY_USER: AuthenticatedUser = {
  authId: "",
  name: "",
  email: "",
};

export const userAtom = atom<AuthenticatedUser>(EMPTY_USER);
