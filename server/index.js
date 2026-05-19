/**
 * index.js — Express Server Entry Point
 *
 * Starts the API server for the University CGPA App.
 * Endpoint: POST /api/fetch-grades
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const { scrapeGrades, AuthError, CaptchaError, ParseError, ScraperError } = require("./scraper");

const app = express();
const PORT = process.env.PORT || 3000;

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────────────────────

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Disabled to allow Tailwind CDN in dev
  })
);

// CORS — Allow only same origin in production; loosen for dev
app.use(
  cors({
    origin: process.env.NODE_ENV === "production" ? false : "*",
    methods: ["POST", "GET"],
  })
);

// Parse JSON bodies
app.use(express.json({ limit: "10kb" })); // Limit body size

// Serve frontend static files
app.use(express.static(path.join(__dirname, "../client")));

// ─────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/fetch-grades
 *
 * Body: { username: string, password: string }
 *
 * Uses Server-Sent Events (SSE) to stream real-time status
 * updates to the frontend, then sends the final grade data.
 */
app.post("/api/fetch-grades", async (req, res) => {
  const { username, password } = req.body;

  // ── Input validation ──────────────────────────────────────
  if (!username || typeof username !== "string" || username.trim().length === 0) {
    return res.status(400).json({ error: "Username is required." });
  }
  if (!password || typeof password !== "string" || password.length === 0) {
    return res.status(400).json({ error: "Password is required." });
  }

  // Max length guard to prevent abuse
  if (username.length > 100 || password.length > 128) {
    return res.status(400).json({ error: "Invalid credentials format." });
  }

  // ── SSE setup for real-time status streaming ──────────────
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (type, payload) => {
    res.write(`data: ${JSON.stringify({ type, ...payload })}\n\n`);
  };

  const credentials = { username: username.trim(), password };

  try {
    // Stream status updates to client
    const onStatus = (message) => {
      sendEvent("status", { message });
    };

    const semesters = await scrapeGrades(credentials, onStatus);

    // Send final data
    sendEvent("done", { semesters });
    res.end();
  } catch (err) {
    console.error(`[Scraper Error] ${err.name}: ${err.message}`);

    let userMessage = "An unexpected error occurred. Please try again.";
    let statusCode = 500;

    if (err instanceof AuthError) {
      userMessage = "Invalid username or password. Please check your credentials.";
      statusCode = 401;
    } else if (err instanceof CaptchaError) {
      userMessage =
        "The university portal has a CAPTCHA. Please log in manually to solve it first, then retry.";
      statusCode = 403;
    } else if (err instanceof ParseError) {
      userMessage =
        "Could not parse the results page. The portal structure may have changed.";
      statusCode = 422;
    } else if (err instanceof ScraperError) {
      userMessage = `Scraper error: ${err.message}`;
      statusCode = 500;
    }

    // Check if headers already sent (SSE started)
    if (!res.headersSent) {
      res.status(statusCode).json({ error: userMessage });
    } else {
      sendEvent("error", { message: userMessage, code: err.code || "UNKNOWN" });
      res.end();
    }
  } finally {
    // Wipe credentials from current scope
    credentials.username = "";
    credentials.password = "";
  }
});

// ── Health check ──────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", mock: process.env.USE_MOCK === "true" });
});

// ── Serve frontend for all other routes ──────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

// ─────────────────────────────────────────────────────────────
// GLOBAL ERROR HANDLER
// ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[Unhandled Error]", err);
  res.status(500).json({ error: "Internal server error." });
});

// ─────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎓  University CGPA Server running on http://localhost:${PORT}`);
  console.log(`📋  Mock mode: ${process.env.USE_MOCK === "true" ? "ON ✅" : "OFF"}`);
  console.log(`🔒  Environment: ${process.env.NODE_ENV || "development"}\n`);
});

module.exports = app;
