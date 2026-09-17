import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const created = [];
mock.module('../models/User.js', {
  defaultExport: {
    findOne: async () => null,
    create: async data => { created.push(data); return { id: 1, ...data }; },
  },
});
mock.module('bcrypt', { defaultExport: { hash: async () => 'test-hash' } });
const { register, verifyToken } = await import('../controllers/authController.js');

function response() {
  return {
    code: 200, body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('registration always creates a regular user', async () => {
  const res = response();
  await register({ body: { name: 'Test', email: 'test@example.invalid', password: 'test-only', roles: 'admin' } }, res);
  assert.equal(res.code, 201);
  assert.equal(created.at(-1).roles, 'user');
  assert.equal(created.at(-1).password, 'test-hash');
  assert.equal(res.body.user.roles, 'user');
  assert.equal(res.body.user.password, undefined);
});

test('verify-token requires a token rather than login credentials', async () => {
  const res = response();
  await verifyToken({ body: { email: 'test@example.invalid', password: 'test-only' } }, res);
  assert.equal(res.code, 400);
  assert.equal(res.body.valid, false);
});
