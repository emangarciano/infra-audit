import { fileURLToPath } from 'node:url';
import express from 'express';
import { authenticate, logIn, logOut, setSessionCookie } from './auth.js';
import { RequestError } from './database.js';
import { amount, amountForCopy, auditRoles, id, oneOf, registerRoles, roles } from './domain.js';
import {
  actOnTransaction, correctProject, correctTransaction, createProject, createTransaction,
  listContractors, listProjects, listTransactions, lookups, readProject, readSlip, readTransaction, saveChecklist,
} from './register.js';

const publicFiles = fileURLToPath(new URL('../public/', import.meta.url));
const policy = "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

function payload(req) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    throw new RequestError(400, 'Send a valid form.');
  }
  return req.body;
}

function browserOrigin(value) {
  if (!value) return null;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('PACCO_ORIGIN must be an HTTP or HTTPS origin, such as https://audit.example.org.');
  }
  return url;
}

export function createApp(database, references, { origin } = {}) {
  const configuredOrigin = browserOrigin(origin);
  const secureOrigin = configuredOrigin?.protocol === 'https:';
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy': policy,
      'Referrer-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      const expectedOrigin = configuredOrigin?.origin ?? `${req.protocol}://${req.get('host')}`;
      if (req.get('sec-fetch-site') === 'cross-site' || (origin && origin !== expectedOrigin)) {
        return next(new RequestError(403, 'Submit forms from the audit application.'));
      }
      if (!req.is('application/json')) {
        return next(new RequestError(415, 'Submit an application form.'));
      }
    }
    next();
  });
  app.use(express.json({ limit: '256kb' }));

  const handle = (access, work, status = 200) => async (req, res) => {
    const result = await database.transaction(async (client) => {
      const user = await authenticate(client, req);
      if (!access.includes(user.role)) throw new RequestError(403, 'Your role cannot perform this operation.');
      return work(client, user, req);
    });
    if (typeof result === 'string') {
      res.set('Content-Security-Policy', `${policy}; script-src 'none'; style-src 'self' 'unsafe-inline'`);
      res.status(status).type('html').send(result);
    } else {
      res.status(status).json(result);
    }
  };

  app.post('/api/session', async (req, res) => {
    const result = await database.transaction(async (client) => {
      const loggedIn = await logIn(client, payload(req));
      if (loggedIn.token) await logOut(client, req);
      return loggedIn;
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    setSessionCookie(res, result.token, secureOrigin || req.secure);
    res.json(result.user);
  });
  app.get('/api/session', handle(roles, (_client, user) => user));
  app.delete('/api/session', async (req, res) => {
    await database.transaction((client) => logOut(client, req));
    setSessionCookie(res, null, secureOrigin || req.secure);
    res.sendStatus(204);
  });
  app.get('/api/lookups', handle(registerRoles, (client) => lookups(client)));
  app.get('/api/contractors', handle(registerRoles, (client) => listContractors(client)));
  app.get('/api/projects', handle(registerRoles, (client, _user, req) =>
    listProjects(client, req.query.q)));
  app.post('/api/projects', handle(registerRoles, (client, user, req) =>
    createProject(client, user, payload(req)), 201));
  app.get('/api/projects/:id', handle(registerRoles, (client, user, req) =>
    readProject(client, user, id(req.params.id))));
  app.patch('/api/projects/:id', handle(auditRoles, (client, user, req) =>
    correctProject(client, user, id(req.params.id), payload(req))));
  app.get('/api/transactions', handle(registerRoles, (client, _user, req) =>
    listTransactions(client, req.query)));
  app.post('/api/transactions', handle(registerRoles, (client, user, req) =>
    createTransaction(client, user, payload(req), references), 201));
  app.get('/api/transactions/:id', handle(registerRoles, (client, user, req) =>
    readTransaction(client, user, id(req.params.id))));
  app.patch('/api/transactions/:id', handle(auditRoles, (client, user, req) =>
    correctTransaction(client, user, id(req.params.id), payload(req))));
  app.patch('/api/transactions/:id/checklist', handle(auditRoles, (client, user, req) =>
    saveChecklist(client, user, id(req.params.id), payload(req))));
  app.post('/api/transactions/:id/actions/:kind', handle(registerRoles, (client, user, req) => {
    const actions = user.role === 'intake' ? ['resubmit'] : ['start', 'suspend', 'resubmit', 'resume', 'certify', 'void'];
    if (!actions.includes(req.params.kind)) throw new RequestError(403, 'Your role cannot record this action.');
    return actOnTransaction(client, user, id(req.params.id), req.params.kind, payload(req), references);
  }));
  app.get('/api/transactions/:id/slips/:eventId', handle(auditRoles, (client, _user, req) =>
    readSlip(client, id(req.params.id), req.params.eventId)));
  app.post('/api/amount-in-words', handle(auditRoles, (_client, _user, req) => {
    const value = amount(payload(req).amount, 'Certified amount');
    return value === null ? {} : amountForCopy(value);
  }));

  app.use(express.static(publicFiles));
  app.use((_req, _res, next) => next(new RequestError(404, 'Page not found.')));
  app.use((error, _req, res, _next) => {
    const status = error instanceof RequestError ? error.status : error.status === 400 || error.status === 413 ? error.status : 500;
    if (status === 500) console.error(error);
    const message = error instanceof RequestError ? error.message
      : status === 500 ? 'The system could not complete the request.'
        : status === 413 ? 'The form is too large.' : 'Send a valid form.';
    res.status(status).json({ error: message, code: error instanceof RequestError ? error.code : undefined });
  });
  return app;
}
