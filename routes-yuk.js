/**
 * /api/agent/yuk — egasi telefon ilovasi.
 * Telegram initData + ADMIN_TELEGRAM_IDS. Bo'sh ro'yxat rad etiladi.
 * initData umri 1 soat. Kalit bu yo'lda ishlamaydi.
 */
const { createYukService } = require('./lib/yuk-service');
const { createYukAccess } = require('./lib/yuk-access');

function registerYukRoutes(app, service, helpers, options) {
  const sendError = helpers.sendError;
  const access = (options && options.access) || createYukAccess({
    pool: options && options.pool,
    store: options && options.store,
    fetchImpl: options && options.fetchImpl,
    now: options && options.accessNow,
  });

  function fail(res, err) {
    if (err && (err.code === '42P01' || err.code === '42703' || err.code === '42P01')) {
      err.status = 503;
      err.message = 'Yuk xati jadvallari yo\'q. migrations/007_yuk_xati.sql va migrations/009_yuk_access.sql ni qo\'llang.';
    }
    sendError(res, err);
  }

  function readInitData(req) {
    const header = req.headers['x-telegram-init-data'];
    const headerValue = Array.isArray(header) ? header[0] : header;
    const authz = String(req.headers.authorization || '');
    const tma = /^tma\s+/i.test(authz) ? authz.replace(/^tma\s+/i, '').trim() : '';
    const body = req.body && typeof req.body.initData === 'string' ? req.body.initData : '';
    const query = req.query && typeof req.query.init_data === 'string' ? req.query.init_data : '';
    return body || tma || (headerValue ? String(headerValue) : '') || query;
  }

  async function owner(req, res) {
    const auth = await access.authorize(readInitData(req));
    if (!auth.ok) {
      const payload = { ok: false, error: auth.error };
      if (auth.reason) payload.reason = auth.reason;
      if (auth.code) payload.code = auth.code;
      res.status(auth.status).json(payload);
      return null;
    }
    return auth;
  }

  function presentMe(auth, data) {
    const copy = Object.assign({}, data);
    if (auth.role === 'writer') copy.role = 'writer';
    return copy;
  }

  function idParam(req, res) {
    if (!/^\d+$/.test(String(req.params.id || ''))) {
      res.status(400).json({ ok: false, error: 'id noto\'g\'ri' });
      return null;
    }
    return req.params.id;
  }

  app.get('/api/agent/yuk/me', async (req, res) => {
    const auth = await owner(req, res);
    if (!auth) return;
    try {
      res.json({ ok: true, data: presentMe(auth, await service.me(auth.user)) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get('/api/agent/yuk/bootstrap', async (req, res) => {
    const auth = await owner(req, res);
    if (!auth) return;
    try {
      res.json({ ok: true, data: await service.bootstrap() });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get('/api/agent/yuk/customers', async (req, res) => {
    const auth = await owner(req, res);
    if (!auth) return;
    try {
      const q = req.query.q != null ? String(req.query.q).slice(0, 80) : '';
      const data = await service.listCustomers(q);
      res.json({ ok: true, count: data.length, data: data });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/api/agent/yuk/customers', async (req, res) => {
    const auth = await owner(req, res);
    if (!auth) return;
    try {
      const data = await service.createCustomer(req.body || {});
      res.status(201).json({ ok: true, data: data });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get('/api/agent/yuk/customers/:id', async (req, res) => {
    const auth = await owner(req, res);
    if (!auth) return;
    const id = idParam(req, res);
    if (!id) return;
    try {
      res.json({ ok: true, data: await service.customerDetail(id) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/api/agent/yuk/customers/:id/payments', async (req, res) => {
    const auth = await owner(req, res);
    if (!auth) return;
    const id = idParam(req, res);
    if (!id) return;
    try {
      const data = await service.collectPayment(id, req.body || {});
      res.status(data && data.replay ? 200 : 201).json({ ok: true, data: data });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/api/agent/yuk/waybills', async (req, res) => {
    const auth = await owner(req, res);
    if (!auth) return;
    try {
      const data = await service.createSale(req.body || {});
      let telegram = null;
      if (!data.replay) {
        try {
          telegram = await service.sendToOwner(data.id, auth.user.id, options);
        } catch (err) {
          telegram = { ok: false, error: err && err.message ? err.message : 'Yuborilmadi' };
        }
      }
      res.status(data && data.replay ? 200 : 201).json({ ok: true, data: data, telegram: telegram });
    } catch (err) {
      fail(res, err);
    }
  });

  app.put('/api/agent/yuk/waybills/:id', async (req, res) => {
    const auth = await owner(req, res);
    if (!auth) return;
    const id = idParam(req, res);
    if (!id) return;
    try {
      res.json({ ok: true, data: await service.editSale(id, req.body || {}) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get('/api/agent/yuk/waybills/:id', async (req, res) => {
    const auth = await owner(req, res);
    if (!auth) return;
    const id = idParam(req, res);
    if (!id) return;
    try {
      res.json({ ok: true, data: await service.waybillText(id) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/api/agent/yuk/waybills/:id/send', async (req, res) => {
    const auth = await owner(req, res);
    if (!auth) return;
    const id = idParam(req, res);
    if (!id) return;
    try {
      const data = await service.sendToOwner(id, auth.user.id, options);
      res.json({ ok: true, data: data });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/api/agent/yuk/payments/:id/reverse', async (req, res) => {
    const auth = await owner(req, res);
    if (!auth) return;
    const id = idParam(req, res);
    if (!id) return;
    try {
      const data = await service.reversePayment(id, req.body || {});
      res.status(data && data.replay ? 200 : 201).json({ ok: true, data: data });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get('/api/agent/yuk/access', async (req, res) => {
    const auth = await access.authorize(readInitData(req));
    if (auth.ok) {
      res.json({ ok: true, allowed: true, role: auth.role });
      return;
    }
    const payload = { ok: false, error: auth.error };
    if (auth.reason) payload.reason = auth.reason;
    if (auth.code) payload.code = auth.code;
    res.status(auth.status).json(payload);
  });

  app.post('/api/agent/yuk/access-requests', async (req, res) => {
    try {
      const result = await access.requestAccess(readInitData(req));
      res.status(result.status).json(result.body);
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/api/agent/yuk/telegram-webhook', async (req, res) => {
    try {
      const result = await access.handleWebhook(req);
      res.status(result.status).json(result.body);
    } catch (err) {
      fail(res, err);
    }
  });

  if (options && typeof options.adminAllowed === 'function') {
    app.get('/api/agent/admin/yuk-access-requests', async (req, res) => {
      if (!options.adminAllowed(req, res)) return;
      const status = req.query.status ? String(req.query.status) : 'pending';
      if (status !== 'all' && status !== 'pending' && status !== 'approved' && status !== 'rejected') {
        res.status(400).json({ ok: false, error: 'status noto\'g\'ri' });
        return;
      }
      try {
        const data = await access.list(status === 'all' ? '' : status);
        res.json({ ok: true, data: data });
      } catch (err) {
        fail(res, err);
      }
    });

    app.post('/api/agent/admin/yuk-access-requests/:telegramId/:action', async (req, res) => {
      if (!options.adminAllowed(req, res)) return;
      const action = req.params.action === 'approve' ? 'approved' : req.params.action === 'reject' ? 'rejected' : '';
      if (!action) {
        res.status(400).json({ ok: false, error: 'amal noto\'g\'ri' });
        return;
      }
      const tgAdmin = options.telegramAdminUser ? options.telegramAdminUser(req) : null;
      const by = tgAdmin && tgAdmin.id != null
        ? String(tgAdmin.id)
        : String(req.headers['x-operator-name'] || 'admin');
      try {
        const data = await access.decide(req.params.telegramId, action, by);
        res.json({ ok: true, data: data });
      } catch (err) {
        fail(res, err);
      }
    });
  }

  app.get('/api/agent/yuk/reminders', async (req, res) => {
    const auth = await owner(req, res);
    if (!auth) return;
    try {
      res.json({ ok: true, data: await service.reminders() });
    } catch (err) {
      fail(res, err);
    }
  });
}

module.exports = function registerFromAgent(app, pool, helpers, options) {
  const store = (options && options.store) || require('./lib/agent-repo').createSqlStore(pool);
  const service = (options && options.yukService) || createYukService(store, helpers);
  const access = (options && options.access) || createYukAccess({
    pool: pool,
    store: store,
    fetchImpl: options && options.fetchImpl,
    now: options && options.accessNow,
  });
  registerYukRoutes(app, service, helpers, Object.assign({}, options, { store: store, pool: pool, access: access }));
  return service;
};

module.exports.registerYukRoutes = registerYukRoutes;
module.exports.createYukService = createYukService;
