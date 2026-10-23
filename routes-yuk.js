/**
 * /api/agent/yuk — egasi telefon ilovasi yoki ERP admin sessiyasi.
 * initData bo'lsa faqat Telegram tekshiruvi. Bo'sh bo'lsa X-Admin-Key sarlavhasi.
 * Kalit query va body dan o'qilmaydi.
 */
const { authenticateOwner, authenticateAdminSession } = require('./lib/admin-auth');
const { createYukService } = require('./lib/yuk-service');

function registerYukRoutes(app, service, helpers, options) {
  const sendError = helpers.sendError;

  function fail(res, err) {
    if (err && (err.code === '42P01' || err.code === '42703' || err.code === '42P01')) {
      err.status = 503;
      err.message = 'Yuk xati jadvallari yo\'q. migrations/007_yuk_xati.sql ni qo\'llang.';
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

  function owner(req, res) {
    const initData = readInitData(req);
    if (initData) {
      const auth = authenticateOwner(initData);
      if (!auth.ok) {
        const payload = { ok: false, error: auth.error };
        if (auth.reason) payload.reason = auth.reason;
        res.status(auth.status).json(payload);
        return null;
      }
      return auth;
    }
    const adminHeader = req.headers && req.headers['x-admin-key'];
    if (adminHeader != null && !Array.isArray(adminHeader) && String(adminHeader) !== '') {
      const admin = authenticateAdminSession(req);
      if (!admin.ok) {
        res.status(admin.status).json({ ok: false, error: admin.error });
        return null;
      }
      return admin;
    }
    const missing = authenticateOwner('');
    const payload = { ok: false, error: missing.error };
    if (missing.reason) payload.reason = missing.reason;
    res.status(missing.status).json(payload);
    return null;
  }

  function chatIdOf(auth) {
    if (!auth || !auth.user || auth.user.id == null || auth.user.id === '') return '';
    return String(auth.user.id);
  }

  function idParam(req, res) {
    if (!/^\d+$/.test(String(req.params.id || ''))) {
      res.status(400).json({ ok: false, error: 'id noto\'g\'ri' });
      return null;
    }
    return req.params.id;
  }

  app.get('/api/agent/yuk/me', async (req, res) => {
    const auth = owner(req, res);
    if (!auth) return;
    try {
      res.json({ ok: true, data: await service.me(auth.user) });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get('/api/agent/yuk/bootstrap', async (req, res) => {
    const auth = owner(req, res);
    if (!auth) return;
    try {
      res.json({ ok: true, data: await service.bootstrap() });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get('/api/agent/yuk/customers', async (req, res) => {
    const auth = owner(req, res);
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
    const auth = owner(req, res);
    if (!auth) return;
    try {
      const data = await service.createCustomer(req.body || {});
      res.status(201).json({ ok: true, data: data });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get('/api/agent/yuk/customers/:id', async (req, res) => {
    const auth = owner(req, res);
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
    const auth = owner(req, res);
    if (!auth) return;
    const id = idParam(req, res);
    if (!id) return;
    try {
      const data = await service.collectPayment(id, req.body || {}, auth.user);
      res.status(data && data.replay ? 200 : 201).json({ ok: true, data: data });
    } catch (err) {
      fail(res, err);
    }
  });

  app.post('/api/agent/yuk/waybills', async (req, res) => {
    const auth = owner(req, res);
    if (!auth) return;
    try {
      const data = await service.createSale(req.body || {}, auth.user);
      let telegram = null;
      const chatId = chatIdOf(auth);
      if (!data.replay && chatId) {
        try {
          telegram = await service.sendToOwner(data.id, chatId, options);
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
    const auth = owner(req, res);
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
    const auth = owner(req, res);
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
    const auth = owner(req, res);
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
    const auth = owner(req, res);
    if (!auth) return;
    const id = idParam(req, res);
    if (!id) return;
    try {
      const data = await service.reversePayment(id, req.body || {}, auth.user);
      res.status(data && data.replay ? 200 : 201).json({ ok: true, data: data });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get('/api/agent/yuk/reminders', async (req, res) => {
    const auth = owner(req, res);
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
  registerYukRoutes(app, service, helpers, options);
  return service;
};

module.exports.registerYukRoutes = registerYukRoutes;
module.exports.createYukService = createYukService;
