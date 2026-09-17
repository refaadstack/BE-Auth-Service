import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = [
  { id: 1, name: 'admin', label: 'Admin', is_system: true, save: async () => true, destroy: async () => true },
  { id: 2, name: 'user', label: 'User', is_system: true, save: async () => true, destroy: async () => true },
];
const perms = [
  { id: 1, key: 'users.manage' },
  { id: 2, key: 'boq.export.internal' },
];
let rolePerms = [{ role_id: 2, permission_id: 2 }];
let userRoles = [];
let usersUpdated = [];

mock.module('../models/User.js', {
  defaultExport: {
    findByPk: async (id) => (Number(id) === 7 ? { id: 7, roles: 'user' } : null),
    update: async (data, opts) => { usersUpdated.push([data, opts]); return [1]; },
    count: async () => 2,
  },
});
mock.module('../models/rbac.js', {
  namedExports: {
  Role: {
    findOne: async ({ where }) => roles.find((r) => r.name === where.name) || null,
    findByPk: async (id) => roles.find((r) => r.id === Number(id)) || null,
    findAll: async ({ where } = {}) => {
      if (!where) return roles;
      if (where.name) return roles.filter((r) => where.name.includes(r.name));
      return roles;
    },
    create: async (data) => ({ id: 9, ...data }),
  },
  Permission: {
    findAll: async ({ where } = {}) => {
      if (!where) return perms;
      return perms.filter((p) => where.key.includes(p.key));
    },
  },
  RolePermission: {
    create: async (data) => { rolePerms.push(data); return data; },
    destroy: async () => true,
    findAll: async () => [],
  },
  UserRole: {
    create: async (data) => { userRoles.push(data); return data; },
    destroy: async () => true,
    count: async () => 0,
    findAll: async () => [],
  },
  getUserPermissions: async () => [],
  },});

const rbac = await import('../controllers/roleController.js');
const { requirePermission } = await import('../middleware/authMiddleware.js');

function response() {
  return {
    code: 200, body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('requirePermission mengizinkan admin legacy tanpa klaim', async () => {
  let next = false;
  await requirePermission('roles.manage')({ user: { roles: 'admin' } }, response(), () => { next = true; });
  assert.equal(next, true);
});

test('requirePermission menolak user tanpa izin', async () => {
  const res = response();
  let next = false;
  await requirePermission('roles.manage')({ user: { roles: 'user', permissions: ['boq.manage'] } }, res, () => { next = true; });
  assert.equal(next, false);
  assert.equal(res.code, 403);
});

test('requirePermission meloloskan klaim wildcard', async () => {
  let next = false;
  await requirePermission('roles.manage')({ user: { roles: 'user', permissions: ['*'] } }, response(), () => { next = true; });
  assert.equal(next, true);
});

test('createRole menolak permission tak dikenal', async () => {
  const res = response();
  await rbac.createRole({ body: { name: 'estimator', label: 'Estimator', permissions: ['tidak.ada'] } }, res);
  assert.equal(res.code, 400);
});

test('createRole menolak nama duplikat', async () => {
  const res = response();
  await rbac.createRole({ body: { name: 'user', label: 'User', permissions: [] } }, res);
  assert.equal(res.code, 409);
});

test('deleteRole memblokir peran sistem', async () => {
  const res = response();
  await rbac.deleteRole({ params: { id: '1' } }, res);
  assert.equal(res.code, 400);
});

test('setUserRoles menolak daftar kosong', async () => {
  const res = response();
  await rbac.setUserRoles({ params: { id: '7' }, body: { roles: [] } }, res);
  assert.equal(res.code, 400);
});

test('setUserRoles sinkron kolom legacy', async () => {
  const res = response();
  await rbac.setUserRoles({ params: { id: '7' }, body: { roles: ['user'] } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(usersUpdated.at(-1)[0], { roles: 'user' });
});
