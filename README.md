# HackNest

HackNest is a simple authentication-based web application built with Express.js, MSSQL, and server-rendered HTML views. It includes login, registration, session handling, and a clean modern UI for the auth pages.

## Features

- User registration with validation
- User login with session-based authentication
- Secure session handling with `express-session`
- Clean, modern login/register UI
- MSSQL database connection via `mssql`
- Static assets served from `public/`

## Requirements

- Node.js 18+ or newer
- npm
- Microsoft SQL Server
- Database named `HackNest`
- `Users` table with at least the fields: `UserID`, `Username`, `Email`, `Password`

## Installation

1. Open a terminal in the project directory.
2. Install dependencies:

```bash
npm install
```

## Database Configuration

The database connection is configured in `db.js`.

Update the connection values if needed:

- `server`
- `port`
- `database`
- `userName`
- `password`

Example:

```js
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
```

## Running the app

Start the server with:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## Project Structure

- `server.js` - Express server entrypoint
- `db.js` - MSSQL database connection
- `routes/auth.js` - Authentication routes for login, registration, and logout
- `views/` - HTML views for login and registration
- `public/css/style.css` - Shared CSS styling

## Notes

- If you want to use environment variables, you can add `dotenv` and switch database settings in `db.js` to read from `.env`.
- Make sure SQL Server is running and accessible before starting the app.
- The app currently uses plain-text password storage in the `Users` table if the route logic is not customized; use hashing for production security.

## License

ISC
