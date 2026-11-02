const helmet = require('helmet');

const TELEGRAM_FRAMES = [
  'https://web.telegram.org',
  'https://webk.telegram.org',
  'https://webz.telegram.org',
  'https://telegram.org',
  'https://*.telegram.org',
];

function isMiniApp(req) {
  const p = req.path || '';
  return p === '/yuk' || p === '/mijoz' || p === '/yuk.html' || p === '/mijoz.html';
}

function securityHeaders(req, res, next) {
  const mini = isMiniApp(req);
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://telegram.org'],
        imgSrc: ["'self'", 'data:', 'https:'],
        frameAncestors: mini ? TELEGRAM_FRAMES : ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: mini ? false : undefined,
  })(req, res, next);
}

module.exports = { securityHeaders, isMiniApp, TELEGRAM_FRAMES };
