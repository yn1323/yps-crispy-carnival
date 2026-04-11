import { atom, useSetAtom } from "jotai";

const DefaultValue = {
  authId: "",
  name: "",
  email: "",
};

export const userAtom = atom(DefaultValue);

export const resetUserAtom = () => {
  const setUser = useSetAtom(userAtom);
  setUser(DefaultValue);
};
