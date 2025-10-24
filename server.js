import express from "express";
import bodyParser from "body-parser";
import { openDb, createTable } from "./database.js";
import path from "path";
import { fileURLToPath } from "url";
import QRCode from "qrcode";
import fs from "fs";
import nodemailer from "nodemailer";
import { Parser } from "json2csv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

// Config via env
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "leegionAdmin2025";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const EMAIL_USER = process.env.EMAIL_USER || "";
const EMAIL_PASS = process.env.EMAIL_PASS || "";
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/qr-codes", express.static(path.join(__dirname, "qr-codes")));

// Ensure QR folder exists
if (!fs.existsSync(path.join(__dirname, "qr-codes"))) {
  fs.mkdirSync(path.join(__dirname, "qr-codes"));
}

await createTable();

// Setup nodemailer (optional)
let transporter = null;
if (EMAIL_USER && EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
  console.log("📧 Email notifications enabled.");
} else {
  console.log("⚠️ Email notifications disabled (set EMAIL_USER and EMAIL_PASS to enable).");
}

// ------------------- ROUTES -------------------

// 🏠 Home page (reservation form)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 🧑‍💼 Admin login page (serves admin.html)
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// 💌 Reservation submission
app.post("/reserve", async (req, res) => {
  const { name, email, phone, guests, message } = req.body;
  try {
    const db = await openDb();
    const result = await db.run(
      "INSERT INTO reservations (name, email, phone, guests, message) VALUES (?, ?, ?, ?, ?)",
      [name, email, phone, guests || 1, message || ""]
    );
    const reservationId = result.lastID;

    // Generate QR code for this guest
    const qrData = `${BASE_URL}/verify/${reservationId}`;
    const qrPath = path.join("qr-codes", `reservation_${reservationId}.png`);
    await QRCode.toFile(path.join(__dirname, qrPath), qrData);

    // Send admin email if configured
    if (transporter && ADMIN_EMAIL) {
      const mailOptions = {
        from: `"Leegion Party" <${EMAIL_USER}>`,
        to: ADMIN_EMAIL,
        subject: `New RSVP: ${name}`,
        html: `
          <h3>New Reservation</h3>
          <p><b>Name:</b> ${name}</p>
          <p><b>Email:</b> ${email}</p>
          <p><b>Phone:</b> ${phone}</p>
          <p><b>Guests:</b> ${guests}</p>
          <p><b>Message:</b> ${message}</p>
          <p><b>ID:</b> ${reservationId}</p>
          <p><img src="${BASE_URL}/${qrPath}" alt="qr" /></p>
        `,
      };
      transporter.sendMail(mailOptions).catch(err => console.error("Email error:", err));
    }

    // Respond with QR display page
    res.send(`<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Reserved</title></head><body style="font-family:Arial,Helvetica,sans-serif;background:#0b0b0b;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center;"><h2>🎶 Thank you, ${name}!</h2><p>Your reservation is confirmed. Show this QR at the door.</p><img src="/${qrPath}" alt="QR" style="width:220px;height:220px;margin-top:12px;"/><div style="margin-top:18px;"><a href="/" style="color:#e50914;text-decoration:none;">Make another reservation</a></div></div></body></html>`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving reservation.");
  }
});

// 🔑 Admin login POST handler
app.post("/admin", async (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).send("<h3>❌ Invalid password</h3><p><a href='/admin'>Back</a></p>");
  }

  const db = await openDb();
  const guests = await db.all("SELECT * FROM reservations ORDER BY created_at DESC");

  const rows = guests.map(g => `
    <tr>
      <td>${g.id}</td>
      <td>${g.name}</td>
      <td>${g.email}</td>
      <td>${g.phone}</td>
      <td>${g.guests}</td>
      <td>${g.created_at}</td>
      <td><a href="/qr-codes/reservation_${g.id}.png" target="_blank">View QR</a></td>
    </tr>
  `).join("");

  res.send(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <title>Admin - Guests</title>
      </head>
      <body style="font-family:Arial,Helvetica,sans-serif;background:#f4f4f4;color:#111;padding:20px;">
        <h2>Guest List</h2>
        <p><a href="/export?password=${encodeURIComponent(password)}">⬇ Export as CSV</a></p>
        <table border="1" cellpadding="8" cellspacing="0">
          ${rows.length ? '<tr style="background:#222;color:#fff;"><th>ID</th><th>Name</th><th>Email</th><th>Phone</th><th>Guests</th><th>Reserved At</th><th>QR</th></tr>' : ''}
          ${rows}
        </table>
        <p><a href="/admin">Back</a></p>
      </body>
    </html>
  `);
});

// 📤 CSV export
app.get("/export", async (req, res) => {
  const { password } = req.query;
  if (password !== ADMIN_PASSWORD) return res.status(403).send("Unauthorized");
  const db = await openDb();
  const guests = await db.all("SELECT * FROM reservations ORDER BY created_at DESC");
  const csv = new Parser().parse(guests || []);
  res.header("Content-Type", "text/csv");
  res.attachment("leegion_guest_list.csv");
  res.send(csv);
});

// ✅ QR verification route
app.get("/verify/:id", async (req, res) => {
  const id = req.params.id;
  const db = await openDb();
  const guest = await db.get("SELECT * FROM reservations WHERE id = ?", [id]);
  if (!guest) return res.status(404).send("<h3>❌ Invalid or expired QR Code</h3>");
  res.send(`<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Verified</title></head><body style="font-family:Arial,Helvetica,sans-serif;background:#0b0b0b;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="text-align:center;"><h2>✅ Verified: ${guest.name}</h2><p>Guests: ${guest.guests}</p><p>Reserved at: ${guest.created_at}</p><p><a href="#" onclick="window.print();return false;" style="color:#e50914;">Print</a></p></div></body></html>`);
});

// 🚀 Start server
app.listen(PORT, () => console.log(`🚀 Server running on ${BASE_URL}`));
