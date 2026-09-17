import Users from '../models/User.js';
import { Role, Permission, RolePermission, UserRole, getUserPermissions } from '../models/rbac.js';

const plain = (o) => (o && typeof o.toJSON === 'function' ? o.toJSON() : o);

const roleWithPermissions = async (role) => {
  const r = plain(role);
  r.permissions = await getRolePermissionKeys(role.id);
  return r;
};

const getRolePermissionKeys = async (roleId) => {
  const links = await RolePermission.findAll({ where: { role_id: roleId } });
  if (links.length === 0) return [];
  const perms = await Permission.findAll({ where: { id: links.map((l) => l.permission_id) } });
  return perms.map((p) => p.key);
};

const validName = (v) => /^[a-z0-9_-]{2,64}$/.test(String(v || ''));

export const listPermissions = async (req, res) => {
  try {
    const rows = await Permission.findAll({ order: [['group', 'ASC'], ['id', 'ASC']] });
    res.json(rows);
  } catch {
    res.status(500).json({ message: 'Gagal mengambil daftar permission' });
  }
};

export const listRoles = async (req, res) => {
  try {
    const roles = await Role.findAll({ order: [['id', 'ASC']] });
    const data = [];
    for (const r of roles) data.push(await roleWithPermissions(r));
    res.json(data);
  } catch {
    res.status(500).json({ message: 'Gagal mengambil daftar peran' });
  }
};

export const createRole = async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim().toLowerCase();
    const label = String(req.body?.label || '').trim();
    const permissionKeys = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    if (!validName(name)) {
      return res.status(400).json({ message: 'Nama peran 2-64 karakter: huruf kecil, angka, - atau _.' });
    }
    if (!label) return res.status(400).json({ message: 'Label peran wajib diisi.' });
    if (await Role.findOne({ where: { name } })) {
      return res.status(409).json({ message: 'Nama peran sudah dipakai.' });
    }
    const perms = permissionKeys.length > 0
      ? await Permission.findAll({ where: { key: permissionKeys } })
      : [];
    if (perms.length !== permissionKeys.length) {
      return res.status(400).json({ message: 'Ada permission key yang tidak dikenal.' });
    }
    const role = await Role.create({ name, label, is_system: false });
    for (const p of perms) await RolePermission.create({ role_id: role.id, permission_id: p.id });
    res.status(201).json(await roleWithPermissions(role));
  } catch {
    res.status(500).json({ message: 'Gagal membuat peran' });
  }
};

export const updateRole = async (req, res) => {
  try {
    const role = await Role.findByPk(req.params.id);
    if (!role) return res.status(404).json({ message: 'Peran tidak ditemukan.' });
    if (role.is_system && role.name === 'admin') {
      return res.status(400).json({ message: 'Peran admin sistem tidak dapat diubah (selalu pegang semua izin).' });
    }
    if (req.body.label !== undefined) {
      const label = String(req.body.label).trim();
      if (!label) return res.status(400).json({ message: 'Label peran tidak boleh kosong.' });
      role.label = label;
    }
    if (req.body.permissions !== undefined) {
      const keys = Array.isArray(req.body.permissions) ? req.body.permissions : [];
      const perms = keys.length > 0 ? await Permission.findAll({ where: { key: keys } }) : [];
      if (perms.length !== keys.length) {
        return res.status(400).json({ message: 'Ada permission key yang tidak dikenal.' });
      }
      await RolePermission.destroy({ where: { role_id: role.id } });
      for (const p of perms) await RolePermission.create({ role_id: role.id, permission_id: p.id });
    }
    await role.save();
    res.json(await roleWithPermissions(role));
  } catch {
    res.status(500).json({ message: 'Gagal memperbarui peran' });
  }
};

export const deleteRole = async (req, res) => {
  try {
    const role = await Role.findByPk(req.params.id);
    if (!role) return res.status(404).json({ message: 'Peran tidak ditemukan.' });
    if (role.is_system) {
      return res.status(400).json({ message: 'Peran sistem tidak dapat dihapus.' });
    }
    const assigned = await UserRole.count({ where: { role_id: role.id } });
    if (assigned > 0) {
      return res.status(409).json({ message: `Peran masih dipakai ${assigned} user. Lepaskan dulu sebelum hapus.` });
    }
    await RolePermission.destroy({ where: { role_id: role.id } });
    await role.destroy();
    res.json({ message: 'Peran dihapus' });
  } catch {
    res.status(500).json({ message: 'Gagal menghapus peran' });
  }
};

// Sinkron kolom legacy Users.roles dari daftar peran (admin bila pegang peran admin).
const syncLegacyRoles = async (userId) => {
  const links = await UserRole.findAll({ where: { user_id: userId } });
  const roles = links.length > 0
    ? await Role.findAll({ where: { id: links.map((l) => l.role_id) } })
    : [];
  const isAdmin = roles.some((r) => r.name === 'admin');
  await Users.update({ roles: isAdmin ? 'admin' : 'user' }, { where: { id: userId } });
  return roles.map((r) => r.name);
};

export const getUserRoles = async (req, res) => {
  try {
    const user = await Users.findByPk(req.params.id, { attributes: { exclude: ['password'] } });
    if (!user) return res.status(404).json({ message: 'User tidak ditemukan.' });
    const links = await UserRole.findAll({ where: { user_id: user.id } });
    const roles = links.length > 0
      ? await Role.findAll({ where: { id: links.map((l) => l.role_id) } })
      : [];
    res.json({ user: plain(user), roles: roles.map((r) => r.name) });
  } catch {
    res.status(500).json({ message: 'Gagal mengambil peran user' });
  }
};

export const setUserRoles = async (req, res) => {
  try {
    const user = await Users.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'User tidak ditemukan.' });
    const names = Array.isArray(req.body?.roles) ? req.body.roles : null;
    if (!names || names.length === 0) {
      return res.status(400).json({ message: 'Daftar peran wajib diisi (minimal satu).' });
    }
    const roles = await Role.findAll({ where: { name: names } });
    if (roles.length !== names.length) {
      return res.status(400).json({ message: 'Ada nama peran yang tidak dikenal.' });
    }
    // Cegah admin terakhir kehilangan peran admin.
    const removingAdmin = user.roles === 'admin' && !roles.some((r) => r.name === 'admin');
    if (removingAdmin) {
      const otherAdmins = await Users.count({ where: { roles: 'admin' } });
      if (otherAdmins <= 1) {
        return res.status(409).json({ message: 'Tidak bisa melepas admin terakhir.' });
      }
    }
    await UserRole.destroy({ where: { user_id: user.id } });
    for (const r of roles) await UserRole.create({ user_id: user.id, role_id: r.id });
    const synced = await syncLegacyRoles(user.id);
    res.json({ message: 'Peran user diperbarui', roles: synced });
  } catch {
    res.status(500).json({ message: 'Gagal memperbarui peran user' });
  }
};
