const sql = require('mssql');

const config = {
  server: process.env.MSSQL_SERVER || 'localhost',
  port: parseInt(process.env.MSSQL_PORT, 10) || 1433,
  database: process.env.MSSQL_DB || 'HackNest',
  authentication: {
    type: 'default',
    options: {
      userName: process.env.MSSQL_USER || 'sa',
      password: process.env.MSSQL_PASSWORD || 'Admin123!'
    }
  },
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectionTimeout: 30000,
    requestTimeout: 30000
  }
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('✅ Connected to MSSQL - HackNest DB');
    return pool;
  })
  .catch(err => {
    console.error('❌ DB Connection Failed:', err.message);
    process.exit(1);
  });

module.exports = { sql, poolPromise };