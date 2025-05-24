// src/server.js
require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const axios = require('axios'); // For making HTTP requests
const cors = require('cors');   // For enabling Cross-Origin Resource Sharing
const rateLimit = require('express-rate-limit'); // For basic rate limiting

const app = express();
const PORT = process.env.PORT || 3000; // Port for the server to listen on

// --- Middlewares ---

// CORS Configuration
// برای امنیت بیشتر، در محیط عملیاتی به جای '*' آدرس دقیق پلاگین فیگما یا دامنه آن را قرار دهید.
// مثال: const allowedOrigins = ['https://www.figma.com', 'http://localhost:YOUR_FIGMA_DEV_PORT'];
const corsOptions = {
  origin: process.env.JIRA_PROXY_ALLOWED_ORIGINS || '*', // Allow requests from specified origins
  methods: ['POST', 'GET', 'OPTIONS'], // Allow only specified HTTP methods
  allowedHeaders: ['Content-Type', 'Authorization'], // Allow only specified headers
};
app.use(cors(corsOptions));

// JSON Body Parser: To parse JSON request bodies
app.use(express.json());

// Rate Limiting: Basic protection against abuse
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: 'درخواست‌های شما بیش از حد مجاز است، لطفاً بعداً تلاش کنید.' },
});
app.use('/api/', apiLimiter); // Apply rate limiting to all /api/ routes

// --- Helper for Base64 Encoding (similar to btoa) ---
const base64Encode = (str) => {
  try {
    return Buffer.from(str).toString('base64');
  } catch (e) {
    console.error("Base64 encoding failed:", e);
    throw new Error("Failed to encode credentials.");
  }
};

// --- Routes ---

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({ message: 'سرور پراکسی فیگما به جیرا فعال است.', status: 'OK' });
});

// Generic Jira API Proxy Endpoint
app.post('/api/jira-proxy', async (req, res) => {
  const { jiraDomain, jiraEmail, jiraToken, jiraApiEndpoint, method, body: requestBody } = req.body;

  // Basic Validation
  if (!jiraDomain || !jiraEmail || !jiraToken || !jiraApiEndpoint || !method) {
    return res.status(400).json({ error: 'فیلدهای ضروری ارسال نشده‌اند: jiraDomain, jiraEmail, jiraToken, jiraApiEndpoint, method' });
  }

  const jiraBaseUrl = `https://${jiraDomain}/rest/api/3`;
  const requestUrl = `${jiraBaseUrl}/${jiraApiEndpoint}`;
  const authToken = `Basic ${base64Encode(`${jiraEmail}:${jiraToken}`)}`;

  console.log(`پراکسی کردن درخواست: ${method} ${requestUrl}`); // Logging for debugging (consider removing sensitive parts in production)

  try {
    const response = await axios({
      method: method.toLowerCase(),
      url: requestUrl,
      data: requestBody, // axios handles GET requests with data in params, POST/PUT/PATCH with data in body
      headers: {
        'Authorization': authToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 15000, // 15 seconds timeout
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error('خطا در هنگام پراکسی به جیرا:', error.response ? error.response.data : error.message);
    if (error.response) {
      res.status(error.response.status).json({
        error: 'خطا در ارتباط با API جیرا',
        jiraError: error.response.data,
      });
    } else if (error.request) {
      res.status(504).json({ error: 'پاسخی از سرور جیرا دریافت نشد (Gateway Timeout).' });
    } else {
      res.status(500).json({ error: `خطای داخلی سرور پراکسی: ${error.message}` });
    }
  }
});

// --- Global Error Handler (Optional, for unhandled errors) ---
app.use((err, req, res, next) => {
  console.error("خطای پیش‌بینی نشده:", err.stack);
  res.status(500).send({ error: 'یک خطای پیش‌بینی نشده در سرور رخ داد!' });
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`سرور پراکسی فیگما به جیرا روی پورت ${PORT} در حال اجرا است.`);
  console.log(`مبداهای مجاز CORS: ${process.env.JIRA_PROXY_ALLOWED_ORIGINS || '*'}`);
});
