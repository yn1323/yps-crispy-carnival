import { atom } from "jotai";

export const EMPTY_USER = {
  authId: "",
  name: "",
  email: "",
};

export const userAtom = atom(EMPTY_USER);
