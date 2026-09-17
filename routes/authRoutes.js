import express from 'express';
import { 
  register, 
  login, 
  getUser, 
  getAllUsers, 
  getUserById, 
  updateUser, 
  deleteUser, 
  changePassword, 
  getUserStats, verifyToken 
} from '../controllers/authController.js';
import { authenticateToken, requirePermission } from '../middleware/authMiddleware.js';
import {
  listPermissions, listRoles, createRole, updateRole, deleteRole,
  getUserRoles, setUserRoles,
} from '../controllers/roleController.js';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/verify-token', verifyToken);

// Protected routes (requires authentication)
router.get('/user', authenticateToken, getUser);
router.get('/users', authenticateToken, requirePermission('users.manage'), getAllUsers);
router.get('/users/:id', authenticateToken, requirePermission('users.manage'), getUserById);
router.put('/users/:id', authenticateToken, updateUser);
router.delete('/users/:id', authenticateToken, requirePermission('users.manage'), deleteUser);
router.put('/users/:id/password', authenticateToken, changePassword);
router.get('/stats', authenticateToken, requirePermission('users.manage'), getUserStats);

// Peran & izin (admin kelola)
router.get('/permissions', authenticateToken, requirePermission('roles.manage'), listPermissions);
router.get('/roles', authenticateToken, requirePermission('roles.manage'), listRoles);
router.post('/roles', authenticateToken, requirePermission('roles.manage'), createRole);
router.put('/roles/:id', authenticateToken, requirePermission('roles.manage'), updateRole);
router.delete('/roles/:id', authenticateToken, requirePermission('roles.manage'), deleteRole);
router.get('/users/:id/roles', authenticateToken, requirePermission('roles.manage'), getUserRoles);
router.put('/users/:id/roles', authenticateToken, requirePermission('roles.manage'), setUserRoles);

export default router;