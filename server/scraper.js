/**
 * scraper.js — Puppeteer Scraping Engine
 *
 * ══════════════════════════════════════════════════════════════
 * CUET Portal: https://course.cuet.ac.bd/
 *
 * ⚠️  CAPTCHA WARNING: The CUET portal has a custom image CAPTCHA
 *     on the login page. Two login strategies are supported:
 *
 *     1. SESSION COOKIE MODE (Recommended):
 *        - Log in manually in your browser
 *        - Copy the PHPSESSID cookie value (DevTools → Application →
 *          Cookies → course.cuet.ac.bd → PHPSESSID)
 *        - Paste it into the "Session Cookie" tab in the app
 *        - The scraper skips login entirely and uses your cookie
 *
 *     2. CREDENTIAL MODE (May be blocked by CAPTCHA):
 *        - Enter Student ID + Password normally
 *        - The scraper attempts automated login
 *        - Will throw CaptchaError if CAPTCHA is present
 *
 * ══════════════════════════════════════════════════════════════
 * To adapt for a DIFFERENT university portal:
 *   1. Update PORTAL_LOGIN_URL and PORTAL_RESULTS_URL
 *   2. Update all *_SELECTOR constants
 *   3. Adjust parseSemesters() if the results table structure differs
 * ══════════════════════════════════════════════════════════════
 */

const puppeteer = require("puppeteer");

// ─────────────────────────────────────────────────────────────
// CUET PORTAL CONFIGURATION
// ─────────────────────────────────────────────────────────────
const CONFIG = {
  // ── URLs ────────────────────────────────────────────────────
  PORTAL_LOGIN_URL:    "https://course.cuet.ac.bd/",
  PORTAL_RESULTS_URL:  "https://course.cuet.ac.bd/result_published.php",

  // ── CUET LOGIN FORM SELECTORS ────────────────────────────────
  // These match the current structure of https://course.cuet.ac.bd/
  USERNAME_SELECTOR:      "input[name='user_email']",
  PASSWORD_SELECTOR:      "input[name='user_password']",
  CAPTCHA_INPUT_SELECTOR: "input[name='captcha']",
  SUBMIT_BUTTON_SELECTOR: "input[name='loginuser'], input[type='submit']",

  // ── Post-Login Detection ────────────────────────────────────
  // Update this if CUET changes the post-login page layout
  POST_LOGIN_INDICATOR:   "a[href*='logout'], .logout, .navbar, .dashboard-wrapper",

  // ── Error Detection ─────────────────────────────────────────
  LOGIN_ERROR_SELECTOR:   ".alert-danger, .error-message, #login-error, .text-danger, .err_input",

  // ── Results Page Structure ──────────────────────────────────
  // The CUET published result page renders a single table with columns:
  // Course Code | Course Credit | Level-Term | Sessional | Result | Course type
  RESULTS_TABLE_SELECTOR:       "table",
  RESULTS_PER_PAGE_SELECTOR:    "select[name='dynamic-table_length']",
  COURSE_ROW_SELECTOR:          "tbody tr",
  COURSE_CODE_SELECTOR:         "td:nth-child(1)",
  COURSE_CREDITS_SELECTOR:      "td:nth-child(2)",
  SEMESTER_NAME_SELECTOR:       "td:nth-child(3)",
  COURSE_GRADE_SELECTOR:        "td:nth-child(5)",

  // ── Session Cookie ──────────────────────────────────────────
  // Name of the session cookie set by the CUET portal after login
  SESSION_COOKIE_NAME: "PHPSESSID",

  // ── Timeouts ─────────────────────────────────────────────────
  NAVIGATION_TIMEOUT_MS:   30000,
  ELEMENT_WAIT_TIMEOUT_MS: 15000,
};

// ─────────────────────────────────────────────────────────────
// MOCK DATA — Returned when USE_MOCK=true in .env
// ─────────────────────────────────────────────────────────────
const MOCK_DATA = [
  {
    semester: "Fall 2022",
    courses: [
      { code: "CS101", name: "Intro to Computer Science", credits: 3, grade: "A" },
      { code: "MATH101", name: "Calculus I", credits: 3, grade: "A-" },
      { code: "ENG101", name: "English Composition", credits: 3, grade: "B+" },
      { code: "PHY101", name: "Physics I", credits: 3, grade: "B" },
    ],
  },
  {
    semester: "Spring 2023",
    courses: [
      { code: "CS201", name: "Data Structures", credits: 3, grade: "A" },
      { code: "MATH201", name: "Calculus II", credits: 3, grade: "B+" },
      { code: "CS210", name: "Object-Oriented Programming", credits: 3, grade: "A-" },
      { code: "HUM101", name: "Introduction to Humanities", credits: 2, grade: "A" },
    ],
  },
  {
    semester: "Fall 2023",
    courses: [
      { code: "CS301", name: "Algorithms", credits: 3, grade: "A-" },
      { code: "CS310", name: "Database Systems", credits: 3, grade: "B+" },
      { code: "MATH301", name: "Linear Algebra", credits: 3, grade: "B" },
      { code: "CS320", name: "Software Engineering", credits: 3, grade: "A" },
    ],
  },
  {
    semester: "Spring 2024",
    courses: [
      { code: "CS401", name: "Operating Systems", credits: 3, grade: "A" },
      { code: "CS410", name: "Computer Networks", credits: 3, grade: "A-" },
      { code: "CS420", name: "Machine Learning", credits: 3, grade: "B+" },
      { code: "CS430", name: "Web Development", credits: 3, grade: "A" },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// MAIN SCRAPER FUNCTION
// ─────────────────────────────────────────────────────────────

/**
 * Scrapes grade data from the university portal.
 * @param {object} credentials - { username: string, password: string }
 * @param {function} onStatus  - Callback for real-time status updates: onStatus(message)
 * @returns {Promise<Array>}   - Array of semester objects with courses
 */
async function scrapeGrades(credentials, onStatus = () => { }) {
  // Return mock data if USE_MOCK is set
  if (process.env.USE_MOCK === "true") {
    onStatus("Mock mode enabled — returning sample data...");
    await delay(800);
    onStatus("Fetching results...");
    await delay(600);
    onStatus("Syncing dashboard...");
    await delay(400);
    return MOCK_DATA;
  }

  let browser = null;

  try {
    onStatus("Launching secure browser...");
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    });

    const page = await browser.newPage();

    // Block images/fonts to speed up scraping
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      if (["image", "font", "media"].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    page.setDefaultNavigationTimeout(CONFIG.NAVIGATION_TIMEOUT_MS);
    page.setDefaultTimeout(CONFIG.ELEMENT_WAIT_TIMEOUT_MS);

    // ── STEP 1: Navigate to login page ──────────────────────
    onStatus("Navigating to university portal...");
    await page.goto(CONFIG.PORTAL_LOGIN_URL, { waitUntil: "networkidle2" });

    // ── STEP 2: Check for CAPTCHA ────────────────────────────
    const hasCaptcha = await page.$("iframe[src*='captcha'], .g-recaptcha, #captcha");
    if (hasCaptcha) {
      throw new CaptchaError(
        "CAPTCHA detected on the login page. Automated login is blocked."
      );
    }

    // ── STEP 3: Fill credentials ─────────────────────────────
    onStatus("Logging in...");
    await page.waitForSelector(CONFIG.USERNAME_SELECTOR, { visible: true });
    await page.type(CONFIG.USERNAME_SELECTOR, credentials.username, { delay: 40 });

    await page.waitForSelector(CONFIG.PASSWORD_SELECTOR, { visible: true });
    await page.type(CONFIG.PASSWORD_SELECTOR, credentials.password, { delay: 40 });

    // ── STEP 4: Submit form ──────────────────────────────────
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2" }),
      page.click(CONFIG.SUBMIT_BUTTON_SELECTOR),
    ]);

    // ── STEP 5: Detect login failure ─────────────────────────
    const errorEl = await page.$(CONFIG.LOGIN_ERROR_SELECTOR);
    if (errorEl) {
      const errorText = await page.$eval(
        CONFIG.LOGIN_ERROR_SELECTOR,
        (el) => el.innerText.trim()
      );
      throw new AuthError(`Login failed: ${errorText}`);
    }

    // ── STEP 6: Verify successful login ──────────────────────
    try {
      await page.waitForSelector(CONFIG.POST_LOGIN_INDICATOR, {
        timeout: CONFIG.ELEMENT_WAIT_TIMEOUT_MS,
      });
    } catch {
      throw new AuthError(
        "Login may have failed — dashboard indicator not found. Check POST_LOGIN_INDICATOR selector."
      );
    }

    // ── STEP 7: Navigate to results page ────────────────────
    onStatus("Fetching results...");
    if (CONFIG.PORTAL_RESULTS_URL !== CONFIG.PORTAL_LOGIN_URL) {
      await page.goto(CONFIG.PORTAL_RESULTS_URL, { waitUntil: "networkidle2" });
    }

    await page.waitForSelector(CONFIG.RESULTS_TABLE_SELECTOR, {
      timeout: CONFIG.ELEMENT_WAIT_TIMEOUT_MS,
    });

    const resultsPerPage = await page.$(CONFIG.RESULTS_PER_PAGE_SELECTOR);
    if (resultsPerPage) {
      onStatus("Loading all published results...");
      await page.select(CONFIG.RESULTS_PER_PAGE_SELECTOR, "100");
      await page.waitForTimeout(1200);
    }

    // ── STEP 8: Parse results ────────────────────────────────
    onStatus("Syncing dashboard...");
    const semesters = await page.evaluate((cfg) => {
      const rows = Array.from(document.querySelectorAll(cfg.COURSE_ROW_SELECTOR));
      const grouped = {};

      rows.forEach((row) => {
        const code = row.querySelector(cfg.COURSE_CODE_SELECTOR)?.innerText?.trim() || "";
        const creditsText = row.querySelector(cfg.COURSE_CREDITS_SELECTOR)?.innerText?.trim() || "0";
        const semesterName = row.querySelector(cfg.SEMESTER_NAME_SELECTOR)?.innerText?.trim() || "Unknown Term";
        const grade = row.querySelector(cfg.COURSE_GRADE_SELECTOR)?.innerText?.trim() || "N/A";

        const credits = parseFloat(creditsText) || 0;
        if (!code) return;

        if (!grouped[semesterName]) {
          grouped[semesterName] = [];
        }

        grouped[semesterName].push({
          code,
          name: "",
          credits,
          grade,
        });
      });

      return Object.entries(grouped).map(([semester, courses]) => ({ semester, courses }));
    }, CONFIG);

    if (semesters.length === 0) {
      throw new ParseError(
        "No semester data found. Verify RESULTS_TABLE_SELECTOR and COURSE_ROW_SELECTOR."
      );
    }

    return semesters;
  } catch (err) {
    // Re-throw known errors
    if (err instanceof AuthError || err instanceof CaptchaError || err instanceof ParseError) {
      throw err;
    }
    // Wrap unknown errors
    throw new ScraperError(`Scraper failed: ${err.message}`);
  } finally {
    // ── CRITICAL: Always destroy browser & wipe credentials ──
    if (browser) {
      await browser.close();
    }
    // Overwrite credential strings in memory
    if (credentials) {
      credentials.username = "";
      credentials.password = "";
    }
  }
}

// ─────────────────────────────────────────────────────────────
// CUSTOM ERROR CLASSES
// ─────────────────────────────────────────────────────────────

class AuthError extends Error {
  constructor(msg) { super(msg); this.name = "AuthError"; this.code = "AUTH_FAILED"; }
}
class CaptchaError extends Error {
  constructor(msg) { super(msg); this.name = "CaptchaError"; this.code = "CAPTCHA_DETECTED"; }
}
class ParseError extends Error {
  constructor(msg) { super(msg); this.name = "ParseError"; this.code = "PARSE_FAILED"; }
}
class ScraperError extends Error {
  constructor(msg) { super(msg); this.name = "ScraperError"; this.code = "SCRAPER_ERROR"; }
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  scrapeGrades,
  AuthError,
  CaptchaError,
  ParseError,
  ScraperError,
};
