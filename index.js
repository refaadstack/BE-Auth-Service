import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import sequelize from './config/db.js';

dotenv.config();

const app = express();

// Middleware
app.use(cors({ credentials: true, origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());
// Health check (Docker/K8s)
app.get('/health', (req, res) => {
  res.status(200).json({ success: true, timestamp: new Date().toISOString() });
});


// Routes
app.use('/api/auth', authRoutes);

// Database connection
sequelize
  .sync()
  .then(() => console.log('✅ MySQL connected and models synced'))
  .catch((err) => console.error('❌ MySQL connection error:', err));

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
