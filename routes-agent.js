/**
 * /api/agent — yuk xati (field sales).
 * Telegram initData HMAC majburiy. Bot token yo'q bo'lsa 503.
 * /api/agent/admin/* server.js dagi admin kalitidan o'tadi.
 */
const crypto = require('crypto');
const { validateTelegramInitData } = require('./lib/telegram-webapp');
const { createAgentService } = require('./lib/agent-service');
const { createSqlStore } = require('./lib/agent-repo');
const { renderNakladnoyHtml, renderNakladnoyPdf } = require('./lib/nakladnoy');

module.exports = function registerAgentRoutes(app, pool, helpers, options) {
  const sendError = helpers.sendError;
  const store = (options && options.store) || createSqlStore(pool);
  const service = createAgentService(store, helpers);

  function safeEqualString(a, b) {
    const ba = Buffer.from(String(a), 'utf8');
    const bb = Buffer.from(String(b), 'utf8');
    if (ba.length !== bb.length) {
      crypto.timingSafeEqual(ba, ba);
      return false;
    }
    return crypto.timingSafeEqual(ba, bb);
  }

  function adminAllowed(req, res) {
    const key = (process.env.ADMIN_KEY || '').trim();
    if (!key) {
      if ((process.env.NODE_ENV || '') === 'production') {
        res.status(503).json({ ok: false, error: 'ADMIN_KEY kerak' });
        return false;
      }
      return true;
    }
    const given = req.headers['x-admin-key'];
    if (given && safeEqualString(given, key)) return true;
    res.status(401).json({ ok: false, error: 'Unauthorized — admin kaliti kerak' });
    return false;
  }

  function sendAgentError(res, err) {
    if (err && (err.code === '42P01' || err.code === '42703')) {
      err.status = 503;
      err.message = 'Agent jadvallari yo\'q. migrations/004_agent_field_sales.sql ni qo\'llang.';
    }
    sendError(res, err);
  }

  function readTelegram(req, res) {
    const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
    if (!token) {
      res.status(503).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN o\'rnatilmagan' });
      return null;
    }
    const initData = req.headers['x-telegram-init-data'] || (req.body && req.body.initData) || '';
    const maxAge = process.env.TELEGRAM_INITDATA_MAX_AGE_SEC;
    const user = validateTelegramInitData(initData, token, {
      maxAgeSec: maxAge == null || maxAge === '' ? undefined : Number(maxAge),
    });
    if (!user) {
      res.status(401).json({ ok: false, error: 'Telegram initData yaroqsiz' });
      return null;
    }
    return user;
  }

  async function loadApprovedAgent(req, res) {
    const tg = readTelegram(req, res);
    if (!tg) return null;
    const me = await service.getMe(tg);
    const agent = me.agent;
    if (!agent || agent.role !== 'agent' || agent.access_status !== 'approved' || agent.is_active === false) {
      res.status(403).json({ ok: false, error: 'Agent tasdiqlanmagan' });
      return null;
    }
    return { tg: tg, agent: agent };
  }

  function idParam(req, res) {
    if (!/^\d+$/.test(String(req.params.id || ''))) {
      res.status(400).json({ ok: false, error: 'id noto\'g\'ri' });
      return null;
    }
    return req.params.id;
  }

  app.get('/api/agent/me', async (req, res) => {
    const tg = readTelegram(req, res);
    if (!tg) return;
    try {
      const data = await service.getMe(tg);
      res.json({ ok: true, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.post('/api/agent/access-requests', async (req, res) => {
    const tg = readTelegram(req, res);
    if (!tg) return;
    try {
      const data = await service.requestAccess(tg, req.body || {});
      res.json({ ok: true, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.get('/api/agent/customers', async (req, res) => {
    try {
      const ctx = await loadApprovedAgent(req, res);
      if (!ctx) return;
      const data = await service.listCustomers(ctx.agent.id);
      res.json({ ok: true, count: data.length, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.post('/api/agent/customers', async (req, res) => {
    try {
      const ctx = await loadApprovedAgent(req, res);
      if (!ctx) return;
      const data = await service.createCustomer(ctx.agent.id, req.body || {});
      res.status(201).json({ ok: true, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.get('/api/agent/customers/:id', async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const ctx = await loadApprovedAgent(req, res);
      if (!ctx) return;
      const data = await service.getCustomer(ctx.agent.id, id);
      res.json({ ok: true, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.put('/api/agent/customers/:id', async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const ctx = await loadApprovedAgent(req, res);
      if (!ctx) return;
      const data = await service.updateCustomer(ctx.agent.id, id, req.body || {});
      res.json({ ok: true, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.delete('/api/agent/customers/:id', async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const ctx = await loadApprovedAgent(req, res);
      if (!ctx) return;
      const data = await service.deactivateCustomer(ctx.agent.id, id);
      res.json({ ok: true, data: data, deactivated: true });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.get('/api/agent/products', async (req, res) => {
    try {
      const ctx = await loadApprovedAgent(req, res);
      if (!ctx) return;
      const data = await service.listProducts();
      res.json({ ok: true, count: data.length, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.get('/api/agent/waybills', async (req, res) => {
    try {
      const ctx = await loadApprovedAgent(req, res);
      if (!ctx) return;
      const data = await service.listWaybills(ctx.agent.id);
      res.json({ ok: true, count: data.length, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.post('/api/agent/waybills', async (req, res) => {
    try {
      const ctx = await loadApprovedAgent(req, res);
      if (!ctx) return;
      const data = await service.createWaybill(ctx.agent, req.body || {});
      res.status(201).json({ ok: true, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.get('/api/agent/waybills/:id/nakladnoy.pdf', async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const ctx = await loadApprovedAgent(req, res);
      if (!ctx) return;
      const data = await service.getWaybill(ctx.agent.id, id);
      const pdf = renderNakladnoyPdf(data);
      const safeCode = String(data.waybill_code || 'xat').replace(/[^A-Za-z0-9._-]+/g, '_');
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', 'inline; filename="yuk-xati-' + safeCode + '.pdf"');
      res.set('Cache-Control', 'no-store');
      res.send(pdf);
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.get('/api/agent/waybills/:id/nakladnoy', async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const ctx = await loadApprovedAgent(req, res);
      if (!ctx) return;
      const data = await service.getWaybill(ctx.agent.id, id);
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'no-store');
      res.send(renderNakladnoyHtml(data));
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.get('/api/agent/waybills/:id', async (req, res) => {
    const id = idParam(req, res);
    if (!id) return;
    try {
      const ctx = await loadApprovedAgent(req, res);
      if (!ctx) return;
      const data = await service.getWaybill(ctx.agent.id, id);
      res.json({ ok: true, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.get('/api/agent/debt-payments', async (req, res) => {
    try {
      const ctx = await loadApprovedAgent(req, res);
      if (!ctx) return;
      const data = await service.listDebtPayments(ctx.agent.id);
      res.json({ ok: true, count: data.length, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.post('/api/agent/debt-payments', async (req, res) => {
    try {
      const ctx = await loadApprovedAgent(req, res);
      if (!ctx) return;
      const data = await service.collectDebt(ctx.agent, req.body || {});
      res.status(201).json({ ok: true, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.get('/api/agent/commission', async (req, res) => {
    try {
      const ctx = await loadApprovedAgent(req, res);
      if (!ctx) return;
      const data = await service.commission(ctx.agent.id);
      res.json({ ok: true, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.post('/api/agent/commission/withdrawals', async (req, res) => {
    try {
      const ctx = await loadApprovedAgent(req, res);
      if (!ctx) return;
      const data = await service.withdraw(ctx.agent.id, req.body || {});
      res.status(201).json({ ok: true, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.get('/api/agent/admin/agents', async (req, res) => {
    if (!adminAllowed(req, res)) return;
    try {
      const data = await service.adminListAgents();
      res.json({ ok: true, count: data.length, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.get('/api/agent/admin/access-requests', async (req, res) => {
    if (!adminAllowed(req, res)) return;
    try {
      const status = String(req.query.status || '').trim();
      const allowed = { pending: 1, approved: 1, rejected: 1, blocked: 1 };
      const data = await service.adminListRequests(allowed[status] ? status : '');
      res.json({ ok: true, count: data.length, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.post('/api/agent/admin/access-requests/:id/approve', async (req, res) => {
    if (!adminAllowed(req, res)) return;
    const id = idParam(req, res);
    if (!id) return;
    try {
      const data = await service.adminApprove(
        id,
        req.headers['x-operator-name'],
        req.body && req.body.commission_enabled_on
      );
      res.json({ ok: true, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.post('/api/agent/admin/access-requests/:id/reject', async (req, res) => {
    if (!adminAllowed(req, res)) return;
    const id = idParam(req, res);
    if (!id) return;
    try {
      const data = await service.adminReject(id, req.headers['x-operator-name']);
      res.json({ ok: true, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.get('/api/agent/admin/waybills', async (req, res) => {
    if (!adminAllowed(req, res)) return;
    try {
      const agentId = req.query.agent_id ? String(req.query.agent_id) : '';
      if (agentId && !/^\d+$/.test(agentId)) {
        return res.status(400).json({ ok: false, error: 'agent_id noto\'g\'ri' });
      }
      const data = await service.adminWaybills(agentId);
      res.json({ ok: true, count: data.length, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.get('/api/agent/admin/debts', async (req, res) => {
    if (!adminAllowed(req, res)) return;
    try {
      const agentId = req.query.agent_id ? String(req.query.agent_id) : '';
      if (agentId && !/^\d+$/.test(agentId)) {
        return res.status(400).json({ ok: false, error: 'agent_id noto\'g\'ri' });
      }
      const data = await service.adminDebts(agentId);
      res.json({ ok: true, count: data.length, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });

  app.get('/api/agent/admin/commissions', async (req, res) => {
    if (!adminAllowed(req, res)) return;
    try {
      const agentId = req.query.agent_id ? String(req.query.agent_id) : '';
      if (agentId && !/^\d+$/.test(agentId)) {
        return res.status(400).json({ ok: false, error: 'agent_id noto\'g\'ri' });
      }
      const data = await service.adminCommissions(agentId);
      res.json({ ok: true, data: data });
    } catch (err) {
      sendAgentError(res, err);
    }
  });
};
