# HackNest

HackNest is a comprehensive Capture The Flag (CTF) platform built with Node.js, Express.js, MSSQL, and server-rendered HTML views. It provides a secure environment for hosting cybersecurity challenges, managing users, and tracking progress with features like live activity feeds, notifications, and an admin panel.

## Features

### User Features
- User registration and login with secure authentication
- Profile management with privacy settings (hidden profiles)
- Challenge browsing and solving with flag submission
- Personal dashboard with statistics and recent activity
- Notification system for challenge updates and announcements
- User settings page for account management and password changes

### Admin Features
- Admin dashboard with user and challenge statistics
- Challenge management (create, edit, delete challenges)
- User management (view users, ban/unban, manage roles)
- Notification broadcasting to all users
- Live activity monitoring of user solves
- Schema designer integration for database management

### Security & Infrastructure
- Secure session handling with express-session
- Password hashing with bcryptjs
- Security middleware (helmet, morgan)
- MSSQL database with connection pooling
- Docker containerization for easy deployment
- Environment variable configuration

## Requirements

### For Docker Deployment (Recommended)
- Docker and Docker Compose
- At least 4GB RAM available

### For Manual Setup
- Node.js 18+ or newer
- npm
- Microsoft SQL Server (or SQL Server in Docker)
- Database named `HackNest`

## Quick Start with Docker

1. Ensure Docker and Docker Compose are installed
2. Clone or navigate to the project directory
3. Run the application:

```bash
docker-compose up --build
```

The application will be available at `http://localhost:3000`

Default credentials:
- Admin: `admin` / `Admin123!`
- Database: `sa` / `Admin123!`

## Manual Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Database Setup

#### Option A: Using Docker for SQL Server
```bash
docker run -e "ACCEPT_EULA=Y" -e "SA_PASSWORD=Admin123!" -p 1433:1433 --name sqlserver -d mcr.microsoft.com/mssql/server:2022-latest
```

#### Option B: Local SQL Server
Ensure SQL Server is running and create a database named `HackNest`.

### 3. Database Schema
Run the SQL script in `HackNest.sql` to create the required tables:
- Users
- Challenges
- Solves
- Notifications

### 4. Configuration
Update `db.js` with your database connection details or set environment variables:

```bash
DB_SERVER=localhost
DB_PORT=1433
DB_NAME=HackNest
DB_USER=sa
DB_PASSWORD=Admin123!
```

### 5. Run the Application

```bash
npm start
```

Open `http://localhost:3000` in your browser.

## Usage

### User Workflow
1. Register a new account or login
2. Browse available challenges
3. Submit flags to solve challenges
4. View your progress on the dashboard
5. Manage your profile and settings

### Admin Workflow
1. Login with admin credentials
2. Access admin panel via `/admin`
3. Manage challenges and users
4. Send notifications to users
5. Monitor live activity

## Project Structure

```
HackNest/
├── server.js              # Express server entrypoint
├── db.js                  # MSSQL database connection
├── package.json           # Dependencies and scripts
├── Dockerfile             # Docker container configuration
├── docker-compose.yml     # Multi-service Docker setup
├── docker-entrypoint.sh   # Container initialization script
├── scripts/
│   └── init-db.js         # Database schema initialization
├── routes/
│   ├── auth.js            # Authentication routes
│   ├── challenges.js      # Challenge management
│   ├── admin.js           # Admin panel routes
│   └── notifications.js   # Notification system
├── views/                 # HTML templates
│   ├── login.html
│   ├── register.html
│   ├── dashboard.html
│   ├── challenges.html
│   ├── profile.html
│   ├── settings.html
│   ├── admin-dashboard.html
│   ├── admin-challenges.html
│   ├── admin-users.html
│   └── notifications.html
├── public/
│   └── css/               # Stylesheets
└── HackNest.sql           # Database schema
```

## API Endpoints

### Authentication
- `POST /login` - User login
- `POST /register` - User registration
- `POST /logout` - User logout
- `GET /api/user-settings` - Get user settings
- `PUT /api/user-settings` - Update user settings

### Challenges
- `GET /challenges` - List challenges
- `POST /api/submit-flag` - Submit flag for challenge
- `GET /api/user-stats` - Get user statistics

### Admin
- `GET /admin` - Admin dashboard
- `GET /api/admin/stats` - Admin statistics
- `POST /api/admin/challenges` - Create challenge
- `PUT /api/admin/challenges/:id` - Update challenge
- `DELETE /api/admin/challenges/:id` - Delete challenge
- `POST /api/admin/notifications` - Send notification

### Notifications
- `GET /api/notifications` - Get user notifications
- `PUT /api/notifications/:id/read` - Mark notification as read
- `GET /api/recent-solves` - Get recent solve activity

## Environment Variables

- `DB_SERVER` - Database server hostname
- `DB_PORT` - Database port (default: 1433)
- `DB_NAME` - Database name (default: HackNest)
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password
- `SESSION_SECRET` - Session secret key
- `PORT` - Application port (default: 3000)

## Development

### Running in Development Mode
```bash
npm run dev  # If nodemon is configured
```

### Database Schema Changes
Modify `HackNest.sql` and `scripts/init-db.js` for schema updates.

### Adding New Features
1. Create routes in `routes/` directory
2. Add corresponding views in `views/`
3. Update navigation and links as needed

## Security Notes

- Passwords are hashed using bcryptjs
- Sessions are secured with express-session
- Helmet middleware provides security headers
- Input validation is implemented on forms
- Admin routes require authentication and role checking

## Troubleshooting

### Database Connection Issues
- Ensure SQL Server is running
- Check connection string in `db.js`
- Verify firewall settings for port 1433

### Docker Issues
- Ensure Docker has sufficient resources
- Check container logs: `docker-compose logs`
- Clean rebuild: `docker-compose down && docker-compose up --build`

### Permission Issues
- Admin user is created automatically on first run
- Default admin credentials: `admin` / `Admin123!`

## Database Backup

To ensure data safety, a backup of the database is included in the repository. You can restore the database from this backup file using SQL Server Management Studio or any compatible SQL client.

### Restoring from Backup

1. Open SQL Server Management Studio.
2. Connect to your SQL Server instance.
3. Right-click on the `Databases` node and select `Restore Database...`.
4. Choose `Device` and select the backup file from the repository.
5. Follow the prompts to restore the database.

### Backup File Location

The backup file is located in the root of the repository. Ensure you have the necessary permissions to access and restore the database from this file.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

ISC
