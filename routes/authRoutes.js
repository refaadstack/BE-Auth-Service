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
  getUserStats 
} from '../controllers/AuthController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes (requires authentication)
router.get('/user', authenticateToken, getUser);
router.get('/users', authenticateToken, getAllUsers);
router.get('/users/:id', authenticateToken, getUserById);
router.put('/users/:id', authenticateToken, updateUser);
router.delete('/users/:id', authenticateToken, deleteUser);
router.put('/users/:id/password', authenticateToken, changePassword);
router.get('/stats', authenticateToken, getUserStats);

export default router;