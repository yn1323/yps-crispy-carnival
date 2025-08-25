export const makeQueryParamsString = (obj: Record<string, string>) => {
  const params = Object.entries(obj)
    .map(([key, value]) => (value ? `${key}=${value}` : null))
    .filter((v) => v !== null);

  return params.join("&");
};

export const isNumber = (string: string) => {
  const regex = /[^0-9]/;

  return !regex.test(string);
};
