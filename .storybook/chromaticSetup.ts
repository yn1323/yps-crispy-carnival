module.exports = {
  env: (config) => ({
    ...config,
    ...process.env,
  }),
};
