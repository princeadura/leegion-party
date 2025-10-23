Leegion Album Listening Party - Reservation System
==================================================

What this contains
- Node.js + Express server (server.js)
- SQLite integration (database.js)
- Public static pages (public/index.html, public/admin.html)
- QR code generation stored in /qr-codes
- Optional email notifications (Nodemailer) if you set environment variables
- CSV export for admin

Quick start
1. Unzip the project.
2. Run `npm install`
3. Configure environment variables (optional - see below)
4. Run `npm start`
5. Open http://localhost:4000

Environment variables (optional)
- ADMIN_PASSWORD : Admin password (default: leegionAdmin2025)
- ADMIN_EMAIL    : Admin email address (used if EMAIL_USER and EMAIL_PASS are set)
- EMAIL_USER     : SMTP username (e.g. Gmail address)
- EMAIL_PASS     : SMTP app password
- BASE_URL       : Public base URL for QR links (default: http://localhost:4000)

Notes
- If you don't set EMAIL_USER and EMAIL_PASS, email notifications will be skipped.
- QR images are saved to /qr-codes as reservation_<id>.png
- The database file reservations.db is created automatically in the project root.
