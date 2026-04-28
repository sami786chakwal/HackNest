const sql = require('mssql');

const config = {
  server: 'localhost',
  port: 1433,
  database: 'HackNest',
  authentication: {
    type: 'default',
    options: {
      userName: 'sa',
      password: 'Admin123!'
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