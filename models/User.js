// models/User.js
import { DataTypes } from 'sequelize';
import sequelize from '../config/db.js';

const Users = sequelize.define('Users', {
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  roles: {
    type: DataTypes.ENUM('admin', 'user'),
    defaultValue: 'user',
  },
});

export default Users;
