import { atom, useSetAtom } from "jotai";

export const EMPTY_USER = {
  authId: "",
  name: "",
  email: "",
};

export const userAtom = atom(EMPTY_USER);

export const resetUserAtom = () => {
  const setUser = useSetAtom(userAtom);
  setUser(EMPTY_USER);
};
