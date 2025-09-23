// database.js
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config();

const isProd = process.env.NODE_ENV === 'production';

const sequelize = isProd
  ? new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASSWORD,
      {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'postgres',
        logging: false,
        dialectOptions: process.env.DB_SSL === 'true' ? {
          ssl: {
            require: true,
            rejectUnauthorized: false, 
          },
        } : {},
        pool: {
          max: parseInt(process.env.DB_POOL_MAX || '15', 10),  // máximo de conexiones
          min: parseInt(process.env.DB_POOL_MIN || '3', 10),   // mínimo de conexiones
          acquire: 30000, // tiempo máximo para obtener una conexión (ms)
          idle: 10000     // tiempo máximo que una conexión puede estar inactiva (ms)
        }
      }
    )
  : new Sequelize({
      dialect: 'sqlite',
      storage: path.join(__dirname, '../../database.sqlite'),
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
    });

const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log(
      `Conexión ${isProd ? 'Postgres' : 'SQLite'} establecida correctamente.`
    );
  } catch (err) {
    console.error('❌  No se pudo conectar a la base de datos:', err);
    process.exit(1);
  }
};

module.exports = {
  sequelize,
  testConnection,
};
