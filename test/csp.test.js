const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const { securityHeaders } = require('../lib/security-headers');

function cspHeaders(port, path) {
  return new Promise(function (resolve, reject) {
    http.get({ host: '127.0.0.1', port: port, path: path }, function (res) {
      const values = [];
      for (let i = 0; i < res.rawHeaders.length; i += 2) {
        if (res.rawHeaders[i].toLowerCase() === 'content-security-policy') {
          values.push(res.rawHeaders[i + 1]);
        }
      }
      res.resume();
      resolve(values);
    }).on('error', reject);
  });
}

test('/yuk and /mijoz send one full CSP with script-src', async () => {
  const app = express();
  app.use(securityHeaders);
  app.get('/yuk', function (req, res) { res.type('html').send('yuk'); });
  app.get('/mijoz', function (req, res) { res.type('html').send('mijoz'); });
  app.get('/admin', function (req, res) { res.type('html').send('admin'); });
  const server = await new Promise(function (resolve) {
    const s = app.listen(0, '127.0.0.1', function () { resolve(s); });
  });
  try {
    const port = server.address().port;
    for (const path of ['/yuk', '/mijoz']) {
      const headers = await cspHeaders(port, path);
      assert.equal(headers.length, 1, path);
      assert.match(headers[0], /default-src 'self'/);
      assert.match(headers[0], /script-src 'self' https:\/\/telegram\.org/);
      assert.match(headers[0], /frame-ancestors https:\/\/web\.telegram\.org/);
      assert.match(headers[0], /https:\/\/webk\.telegram\.org/);
      assert.doesNotMatch(headers[0], /frame-ancestors 'none'/);
    }
    const admin = await cspHeaders(port, '/admin');
    assert.equal(admin.length, 1);
    assert.match(admin[0], /script-src 'self' https:\/\/telegram\.org/);
    assert.match(admin[0], /frame-ancestors 'none'/);
  } finally {
    await new Promise(function (resolve) { server.close(resolve); });
  }
});
