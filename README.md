# Waste Management System

A waste reporting and collection website built with **Node.js**, **Express**, and **EJS-rendered HTML**. The frontend uses plain HTML, CSS, JavaScript, and locally compiled **Tailwind CSS** utilities. The project does not use Bootstrap, C#, ASP.NET, or .NET.

## Requirements

- Node.js 20 or newer
- SQL Server LocalDB and Microsoft ODBC Driver 17 for SQL Server (for the default database connection)

## Run locally

1. Start the existing LocalDB instance if needed:

   ```powershell
   sqllocaldb start ProjectModels
   ```

2. Install dependencies:

   ```powershell
   npm install
   ```

3. Start the website:

   ```powershell
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000).

Run `npm run dev` to restart the server automatically while developing, `npm run build:css` to rebuild the Tailwind stylesheet, and `npm test` to run the automated tests.

## Database and configuration

The default connection uses Windows authentication to `(localdb)\ProjectModels`, database `WasteManagementDB`. It connects to the existing database; it does not recreate or migrate it. To use another SQL Server, set `WASTE_DB_CONNECTION` to an ODBC connection string.

Optional environment variables:

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (defaults to `3000`) |
| `WASTE_DB_CONNECTION` | SQL Server ODBC connection string |
| `SESSION_SECRET` | Secret used to sign sessions; set a private value before deployment |
| `ADMIN_USERNAME` | Admin login name |
| `ADMIN_PASSWORD` | Admin password |

The built-in admin credentials are retained for local compatibility. Configure private admin credentials and a private session secret before deployment.

## Project structure

```text
.
├── public/
│   ├── css/                 Site styles
│   ├── js/                  Browser-side JavaScript
│   └── favicon.ico
├── src/
│   └── styles.css           Tailwind input and site-specific styles
├── test/                    Automated tests
├── views/
│   ├── Admin/               Admin dashboard and login
│   ├── Citizen/             Citizen login, registration, and confirmation
│   ├── Feedback/            Feedback form
│   ├── Home/                Home, about, and contact pages
│   ├── Shared/              Shared page layout and error page
│   ├── Waste/               Complaint reporting, tracking, and details
│   └── Worker/              Worker login, registration, and dashboard
├── database.js              SQL Server connection and query helper
├── server.js                Express routes and application startup
├── package.json             Scripts and dependencies
├── tailwind.config.js        Tailwind content scanning configuration
└── README.md                Setup and project documentation
```
