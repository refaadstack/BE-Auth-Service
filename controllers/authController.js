import Users from '../models/User.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Lazy import agar unit test yang mem-mock models/User.js tidak ikut memuat rbac.
const loadPermissions = async (userId, legacyRoles) => {
  const { getUserPermissions } = await import('../models/rbac.js');
  return getUserPermissions(userId, legacyRoles);
};

// Register
export const register = async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // Check if user already exists
    const existingUser = await Users.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'User dengan email ini sudah terdaftar' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await Users.create({
      name,
      email,
      password: hashedPassword,
      roles: 'user'
    });
    try {
      const { Role, UserRole } = await import('../models/rbac.js');
      const userRole = await Role.findOne({ where: { name: 'user' } });
      if (userRole) await UserRole.findOrCreate({ where: { user_id: newUser.id, role_id: userRole.id } });
    } catch {
      // RBAC belum siap: user tetap dibuat dengan peran legacy 'user'
    }

    res.status(201).json({ 
      message: 'User berhasil dibuat!',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        roles: newUser.roles
      }
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Login
export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await Users.findOne({ where: { email } });

    if (!user) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Password salah' });
    }

    const permissions = await loadPermissions(user.id, user.roles);
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles,
        permissions
      },
      process.env.JWT_SECRET_KEY,
      { expiresIn: '1h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles,
        permissions
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get current user (by token)
export const getUser = async (req, res) => {
  try {
    const user = await Users.findByPk(req.user.userId, {
      attributes: { exclude: ['password'] }, // Don't return password
    });

    if (!user) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all users (Admin only)
export const getAllUsers = async (req, res) => {
  try {
    const users = await Users.findAll({
      attributes: { exclude: ['password'] }, // Don't return passwords
      order: [['createdAt', 'DESC']] // Sort by newest first
    });

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get user by ID (Admin only)
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await Users.findByPk(id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update user (Admin only or own profile)
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, roles } = req.body;

    // Check if user is admin or updating own profile
    if (req.user.roles !== 'admin' && req.user.userId !== parseInt(id)) {
      return res.status(403).json({ 
        message: 'Akses ditolak. Anda hanya dapat mengubah profil sendiri.' 
      });
    }

    const user = await Users.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    // Check if email already exists (if changing email)
    if (email && email !== user.email) {
      const existingUser = await Users.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email sudah digunakan' });
      }
    }

    // Only admin can change roles
    const updateData = { name, email };
    if (req.user.roles === 'admin' && roles) {
      updateData.roles = roles;
    }

    await user.update(updateData);

    res.json({ 
      message: 'User berhasil diperbarui',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roles: user.roles
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete user (Admin only)
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Prevent admin from deleting themselves
    if (req.user.userId === parseInt(id)) {
      return res.status(400).json({ 
        message: 'Anda tidak dapat menghapus akun sendiri.' 
      });
    }

    const user = await Users.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    await user.destroy();

    res.json({ 
      message: 'User berhasil dihapus',
      deletedUser: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Change password
export const changePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    // Check if user is admin or changing own password
    if (req.user.roles !== 'admin' && req.user.userId !== parseInt(id)) {
      return res.status(403).json({ 
        message: 'Akses ditolak. Anda hanya dapat mengubah password sendiri.' 
      });
    }

    const user = await Users.findByPk(id);
    if (!user) {
      return res.status(404).json({ message: 'User tidak ditemukan' });
    }

    // For non-admin users, verify current password
    if (req.user.roles !== 'admin') {
      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: 'Password lama salah' });
      }
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await user.update({ password: hashedNewPassword });

    res.json({ message: 'Password berhasil diubah' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get user statistics (Admin only)
export const getUserStats = async (req, res) => {
  try {
    const totalUsers = await Users.count();
    const adminUsers = await Users.count({ where: { roles: 'admin' } });
    const regularUsers = await Users.count({ where: { roles: 'user' } });

    res.json({
      totalUsers,
      adminUsers,
      regularUsers,
      stats: {
        adminPercentage: totalUsers > 0 ? ((adminUsers / totalUsers) * 100).toFixed(1) : 0,
        regularPercentage: totalUsers > 0 ? ((regularUsers / totalUsers) * 100).toFixed(1) : 0
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// Verify token (for inter-service authentication, e.g. BOQ service)
export const verifyToken = async (req, res) => {
  const { token } = req.body;
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ valid: false, message: 'Token diperlukan' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY, { algorithms: ['HS256'] });
    try {
      const fresh = await Users.findByPk(decoded.userId, { attributes: ['id', 'roles'] });
      if (!fresh) return res.json({ valid: false, message: 'User tidak ditemukan' });
      const permissions = await loadPermissions(fresh.id, fresh.roles);
      return res.json({
        valid: true,
        user: {
          id: fresh.id,
          email: decoded.email,
          name: decoded.name,
          roles: fresh.roles,
          permissions,
        },
      });
    } catch {
      // DB tidak terjangkau: pakai klaim token apa adanya
    }
    return res.json({
      valid: true,
      user: {
        id: decoded.userId,
        email: decoded.email,
        name: decoded.name,
        roles: decoded.roles,
        permissions: Array.isArray(decoded.permissions) ? decoded.permissions : null,
      },
    });
  } catch (error) {
    return res.json({ valid: false, message: 'Token tidak valid' });
  }
};
