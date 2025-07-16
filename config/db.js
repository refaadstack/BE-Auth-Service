// config/db.js
import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const {
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  DB_HOST,
  DB_DIALECT
} = process.env;

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST,
  dialect: DB_DIALECT || 'mysql', // fallback ke mysql kalau kosong
  logging: false, // nonaktifkan log SQL di console
});

// Optional: tes koneksi (bisa hapus kalau udah dites di tempat lain)
try {
  await sequelize.authenticate();
  console.log('✅ Database connection has been established successfully.');
} catch (error) {
  console.error('❌ Unable to connect to the database:', error.message);
}

export default sequelize;
