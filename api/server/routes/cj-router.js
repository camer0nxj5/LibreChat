const express = require('express');
const { requireJwtAuth, configMiddleware, validateConvoAccess } = require('~/server/middleware');
const { assess } = require('~/server/services/CJRouting');

const router = express.Router();
router.post('/assess', requireJwtAuth, configMiddleware, validateConvoAccess, assess);
module.exports = router;
