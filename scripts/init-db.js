const sql = require('mssql');
const bcrypt = require('bcryptjs');

const dbName = process.env.MSSQL_DB || 'HackNest';
const server = process.env.MSSQL_SERVER || 'localhost';
const port = parseInt(process.env.MSSQL_PORT, 10) || 1433;
const user = process.env.MSSQL_USER || 'sa';
const password = process.env.MSSQL_PASSWORD || 'Admin123!';
const adminUser = process.env.APP_ADMIN_USERNAME || 'admin';
const adminEmail = process.env.APP_ADMIN_EMAIL || 'admin@hacknest.local';
const adminPassword = process.env.APP_ADMIN_PASSWORD || 'Admin123!';

const masterConfig = {
  server,
  port,
  database: 'master',
  authentication: {
    type: 'default',
    options: {
      userName: user,
      password,
    },
  },
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

async function ensureDatabase() {
  const pool = await sql.connect(masterConfig);
  await pool.request().query(`IF DB_ID(N'${dbName}') IS NULL CREATE DATABASE [${dbName}]`);
  await pool.close();
}

async function ensureSchema() {
  const config = { ...masterConfig, database: dbName };
  const pool = await sql.connect(config);

  await pool.request().query(`
    IF OBJECT_ID(N'Users', N'U') IS NULL
    CREATE TABLE Users (
      UserID INT IDENTITY(1,1) PRIMARY KEY,
      Username NVARCHAR(100) NOT NULL UNIQUE,
      Email NVARCHAR(255) NOT NULL UNIQUE,
      Password NVARCHAR(255) NOT NULL,
      Score INT NOT NULL DEFAULT 0,
      Role NVARCHAR(50) NOT NULL DEFAULT 'User',
      IsBanned BIT NOT NULL DEFAULT 0,
      IsHidden BIT NOT NULL DEFAULT 0,
      CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
  `);

  await pool.request().query(`
    IF OBJECT_ID(N'Challenges', N'U') IS NULL
    CREATE TABLE Challenges (
      ChallengeID INT IDENTITY(1,1) PRIMARY KEY,
      Title NVARCHAR(255) NOT NULL,
      Description NVARCHAR(MAX) NOT NULL,
      Category NVARCHAR(100) NOT NULL,
      Difficulty NVARCHAR(50) NOT NULL,
      Points INT NOT NULL,
      Flag NVARCHAR(255) NOT NULL,
      Hint NVARCHAR(MAX) NULL,
      IsActive BIT NOT NULL DEFAULT 1,
      CreatedBy INT NULL,
      CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      FOREIGN KEY (CreatedBy) REFERENCES Users(UserID)
    );
  `);

  await pool.request().query(`
    IF OBJECT_ID(N'Solves', N'U') IS NULL
    CREATE TABLE Solves (
      SolveID INT IDENTITY(1,1) PRIMARY KEY,
      UserID INT NOT NULL,
      ChallengeID INT NOT NULL,
      SolvedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      FOREIGN KEY (UserID) REFERENCES Users(UserID),
      FOREIGN KEY (ChallengeID) REFERENCES Challenges(ChallengeID)
    );
  `);

  await pool.request().query(`
    IF OBJECT_ID(N'Notifications', N'U') IS NULL
    CREATE TABLE Notifications (
      NotificationID INT IDENTITY(1,1) PRIMARY KEY,
      Title NVARCHAR(255) NOT NULL,
      Message NVARCHAR(MAX) NOT NULL,
      Type NVARCHAR(50) NOT NULL DEFAULT 'info',
      CreatedBy INT NOT NULL,
      CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      IsActive BIT NOT NULL DEFAULT 1,
      FOREIGN KEY (CreatedBy) REFERENCES Users(UserID)
    );
  `);

  await pool.request().query(`
    IF OBJECT_ID(N'NotificationReads', N'U') IS NULL
    CREATE TABLE NotificationReads (
      ReadID INT IDENTITY(1,1) PRIMARY KEY,
      NotificationID INT NOT NULL,
      UserID INT NOT NULL,
      ReadAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      FOREIGN KEY (NotificationID) REFERENCES Notifications(NotificationID),
      FOREIGN KEY (UserID) REFERENCES Users(UserID)
    );
  `);

  const existingAdmin = await pool.request()
    .input('username', sql.NVarChar, adminUser)
    .query('SELECT UserID FROM Users WHERE Username = @username');

  if (existingAdmin.recordset.length === 0) {
    const hashed = await bcrypt.hash(adminPassword, 12);
    await pool.request()
      .input('username', sql.NVarChar, adminUser)
      .input('email', sql.NVarChar, adminEmail)
      .input('password', sql.NVarChar, hashed)
      .input('role', sql.NVarChar, 'Admin')
      .query(`
        INSERT INTO Users (Username, Email, Password, Role, Score, IsBanned, IsHidden)
        VALUES (@username, @email, @password, @role, 0, 0, 0)
      `);
    console.log(`Created default admin account: ${adminUser}`);
  }

  await pool.close();
}

async function main() {
  console.log('Initializing database...');
  await ensureDatabase();
  await ensureSchema();
  console.log('Database ready.');
}

main().catch(err => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});