import type { LoginMethodCapabilities } from "./types";

export const LOGIN_METHOD_CAPABILITY_NAMES = [
  "connectGoogle",
  "reconnectGoogle",
  "disconnectGoogle",
  "setPassword",
  "changePassword",
  "removePassword",
  "removeEmailAddress",
  "replaceGoogleAccount",
] as const satisfies readonly (keyof LoginMethodCapabilities)[];

type LoginMethodCapabilityName = (typeof LOGIN_METHOD_CAPABILITY_NAMES)[number];

type BuildLoginMethodCapabilitiesInput = {
  mode: string;
  canary: string | undefined;
};

const CAPABILITY_NAME_SET = new Set<string>(LOGIN_METHOD_CAPABILITY_NAMES);

export const DISABLED_LOGIN_METHOD_CAPABILITIES: Readonly<LoginMethodCapabilities> = Object.freeze(
  Object.fromEntries(LOGIN_METHOD_CAPABILITY_NAMES.map((name) => [name, false])) as LoginMethodCapabilities,
);

export function buildLoginMethodCapabilities({
  mode,
  canary,
}: BuildLoginMethodCapabilitiesInput): Readonly<LoginMethodCapabilities> {
  if (mode !== "clerk-canary") return DISABLED_LOGIN_METHOD_CAPABILITIES;

  const enabledCapabilities = parseCapabilityList(canary);
  if (!enabledCapabilities) return DISABLED_LOGIN_METHOD_CAPABILITIES;

  return Object.freeze(
    Object.fromEntries(
      LOGIN_METHOD_CAPABILITY_NAMES.map((name) => [name, enabledCapabilities.includes(name)]),
    ) as LoginMethodCapabilities,
  );
}

export const LOGIN_METHOD_CAPABILITIES = buildLoginMethodCapabilities({
  mode: import.meta.env.MODE,
  canary: import.meta.env.VITE_LOGIN_METHOD_CANARY_CAPABILITIES,
});

function parseCapabilityList(value: string | undefined): readonly LoginMethodCapabilityName[] | null {
  if (!value) return null;
  if (!/^[A-Za-z]+(?:,[A-Za-z]+)*$/.test(value)) return null;

  const names = value.split(",");
  if (new Set(names).size !== names.length || names.some((name) => !CAPABILITY_NAME_SET.has(name))) return null;

  return names as LoginMethodCapabilityName[];
}
