type CommercialTransactionsDisclosure = {
  name: string;
  address: string;
  phoneNumber: string;
};

type CommercialTransactionsDisclosureSource = {
  name?: string;
  address?: string;
  phoneNumber?: string;
};

const ENVIRONMENT_VARIABLES = {
  name: "VITE_COMMERCIAL_TRANSACTIONS_NAME",
  address: "VITE_COMMERCIAL_TRANSACTIONS_ADDRESS",
  phoneNumber: "VITE_COMMERCIAL_TRANSACTIONS_PHONE_NUMBER",
} as const;

const LOCAL_FALLBACK = {
  name: "【環境変数未設定：名前】",
  address: "【環境変数未設定：住所】",
  phoneNumber: "【環境変数未設定：電話番号】",
} as const satisfies CommercialTransactionsDisclosure;

export function resolveCommercialTransactionsDisclosure(
  appEnvironment: string,
  source: CommercialTransactionsDisclosureSource,
): CommercialTransactionsDisclosure {
  const disclosure = {
    name: normalizeDisclosureValue(source.name),
    address: normalizeDisclosureValue(source.address),
    phoneNumber: normalizeDisclosureValue(source.phoneNumber),
  };

  if (appEnvironment === "production") {
    const missingVariables = (Object.keys(disclosure) as Array<keyof CommercialTransactionsDisclosure>)
      .filter((field) => !disclosure[field])
      .map((field) => ENVIRONMENT_VARIABLES[field]);

    if (missingVariables.length > 0) {
      throw new Error(`特定商取引法表記のProduction環境変数が未設定です: ${missingVariables.join(", ")}`);
    }
  }

  return {
    name: disclosure.name || LOCAL_FALLBACK.name,
    address: disclosure.address || LOCAL_FALLBACK.address,
    phoneNumber: disclosure.phoneNumber || LOCAL_FALLBACK.phoneNumber,
  };
}

function normalizeDisclosureValue(value: string | undefined): string {
  return value?.trim().replaceAll("\\n", "\n") ?? "";
}

export const commercialTransactionsDisclosure = resolveCommercialTransactionsDisclosure(__APP_ENVIRONMENT__, {
  name: import.meta.env.VITE_COMMERCIAL_TRANSACTIONS_NAME,
  address: import.meta.env.VITE_COMMERCIAL_TRANSACTIONS_ADDRESS,
  phoneNumber: import.meta.env.VITE_COMMERCIAL_TRANSACTIONS_PHONE_NUMBER,
});
