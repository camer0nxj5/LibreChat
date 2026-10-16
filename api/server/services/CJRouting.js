const { createCJRoutingHandlers } = require('@librechat/api');

module.exports = createCJRoutingHandlers({
  readSecret: (name) => process.env[name],
  fetchImpl: globalThis.fetch,
});
