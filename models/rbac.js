import { DataTypes, Op } from 'sequelize';
import sequelize from '../config/db.js';
import Users from './User.js';

// Katalog permission tetap (key stabil, dipakai lintas service).
export const PERMISSIONS = [
  { key: 'users.manage', label: 'Kelola pengguna', group: 'Pengguna' },
  { key: 'roles.manage', label: 'Kelola peran & izin', group: 'Pengguna' },
  { key: 'settings.manage', label: 'Kelola pengaturan & kop', group: 'Pengaturan' },
  { key: 'vendor.manage', label: 'Kelola vendor', group: 'Operasional' },
  { key: 'item.manage', label: 'Kelola item', group: 'Operasional' },
  { key: 'project.manage', label: 'Kelola proyek', group: 'Operasional' },
  { key: 'boq.manage', label: 'Kelola BOQ', group: 'Operasional' },
  { key: 'boq.approve', label: 'Setujui/tolak BOQ', group: 'Persetujuan' },
  { key: 'boq.export.internal', label: 'Lihat harga beli & laba di export', group: 'Export' },
];

// Permission default peran user (menjaga perilaku lama: semua user bisa
// operasional + export internal; yang terkunci hanya admin area).
export const DEFAULT_USER_PERMISSIONS = [
  'vendor.manage',
  'item.manage',
  'project.manage',
  'boq.manage',
  'boq.export.internal',
];

export const Permission = sequelize.define('Permission', {
  key: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  label: { type: DataTypes.STRING(128), allowNull: false },
  group: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'Lainnya' },
}, { tableName: 'permissions', timestamps: true, underscored: true });

export const Role = sequelize.define('Role', {
  name: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  label: { type: DataTypes.STRING(128), allowNull: false },
  is_system: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { tableName: 'roles', timestamps: true, underscored: true });

export const RolePermission = sequelize.define('RolePermission', {
  role_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'roles', key: 'id' } },
  permission_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'permissions', key: 'id' } },
}, {
  tableName: 'role_permissions', timestamps: false, underscored: true,
  indexes: [{ unique: true, fields: ['role_id', 'permission_id'] }],
});

export const UserRole = sequelize.define('UserRole', {
  user_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'Users', key: 'id' } },
  role_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'roles', key: 'id' } },
}, {
  tableName: 'user_roles', timestamps: true, underscored: true,
  indexes: [{ unique: true, fields: ['user_id', 'role_id'] }],
});

Role.belongsToMany(Permission, { through: RolePermission, foreignKey: 'role_id', otherKey: 'permission_id', as: 'permissions' });
Permission.belongsToMany(Role, { through: RolePermission, foreignKey: 'permission_id', otherKey: 'role_id', as: 'roles' });
Users.belongsToMany(Role, { through: UserRole, foreignKey: 'user_id', otherKey: 'role_id', as: 'userRoles' });
Role.belongsToMany(Users, { through: UserRole, foreignKey: 'role_id', otherKey: 'user_id', as: 'users' });

// Seed idempoten: dijalankan tiap boot setelah sync.
export const seedRbac = async () => {
  for (const p of PERMISSIONS) {
    await Permission.findOrCreate({ where: { key: p.key }, defaults: { label: p.label, group: p.group } });
  }
  const allPerms = await Permission.findAll();
  const byKey = new Map(allPerms.map((p) => [p.key, p]));

  const [adminRole] = await Role.findOrCreate({
    where: { name: 'admin' },
    defaults: { label: 'Admin', is_system: true },
  });
  const [userRole] = await Role.findOrCreate({
    where: { name: 'user' },
    defaults: { label: 'User', is_system: true },
  });

  // Admin selalu pegang semua permission (termasuk yang baru ditambah belakangan).
  for (const p of allPerms) {
    await RolePermission.findOrCreate({ where: { role_id: adminRole.id, permission_id: p.id } });
  }
  for (const key of DEFAULT_USER_PERMISSIONS) {
    const perm = byKey.get(key);
    if (perm) await RolePermission.findOrCreate({ where: { role_id: userRole.id, permission_id: perm.id } });
  }

  // User lama tanpa peran: beri peran sesuai kolom legacy.
  const users = await Users.findAll({ attributes: ['id', 'roles'] });
  for (const u of users) {
    const has = await UserRole.findOne({ where: { user_id: u.id } });
    if (!has) {
      const role = u.roles === 'admin' ? adminRole : userRole;
      await UserRole.create({ user_id: u.id, role_id: role.id });
    }
  }
};

// Daftar permission key milik user. Legacy admin => ['*'].
export const getUserPermissions = async (userId, legacyRoles) => {
  if (legacyRoles === 'admin') return ['*'];
  const rows = await UserRole.findAll({ where: { user_id: userId } });
  if (rows.length === 0) return [];
  const roleIds = rows.map((r) => r.role_id);
  const links = await RolePermission.findAll({ where: { role_id: { [Op.in]: roleIds } } });
  if (links.length === 0) return [];
  const permIds = [...new Set(links.map((l) => l.permission_id))];
  const perms = await Permission.findAll({ where: { id: { [Op.in]: permIds } } });
  return perms.map((p) => p.key);
};

export const hasPermission = (granted, ...keys) => {
  if (!Array.isArray(granted)) return false;
  if (granted.includes('*')) return true;
  return keys.every((k) => granted.includes(k));
};

export default { Permission, Role, RolePermission, UserRole, PERMISSIONS, seedRbac, getUserPermissions, hasPermission };
