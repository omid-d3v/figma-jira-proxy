// src/server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

const corsOptions = {
  origin: process.env.JIRA_PROXY_ALLOWED_ORIGINS || '*',
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'], // Authorization is not expected from client to proxy
};
app.use(cors(corsOptions));
app.use(express.json());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes.' },
});
app.use('/api/', apiLimiter);

const base64Encode = (str) => Buffer.from(str).toString('base64');

app.get('/', (req, res) => {
  res.status(200).json({ message: 'Figma to Jira Proxy Server is active.', status: 'OK' });
});

app.post('/api/jira-proxy', async (req, res) => {
  const { jiraDomain, jiraEmail, jiraToken, jiraApiEndpoint, method, body: requestBody } = req.body;

  if (!jiraDomain || !jiraEmail || !jiraToken || !jiraApiEndpoint || !method) {
    console.warn('Proxy request missing required fields:', req.body);
    return res.status(400).json({ error: 'Missing required fields: jiraDomain, jiraEmail, jiraToken, jiraApiEndpoint, method' });
  }

  const jiraBaseUrl = `https://${jiraDomain}/rest/api/3`;
  const requestUrl = `${jiraBaseUrl}/${jiraApiEndpoint}`;
  const authToken = `Basic ${base64Encode(`${jiraEmail}:${jiraToken}`)}`;

  // Define a common User-Agent and Accept-Language
  const commonUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'; // Updated Chrome version
  const commonAcceptLanguage = 'en-US,en;q=0.9,fa;q=0.8'; // Added Persian as a secondary language

  console.log(`Proxying request: ${method.toUpperCase()} ${requestUrl}`);

  try {
    const response = await axios({
      method: method.toLowerCase(),
      url: requestUrl,
      data: requestBody,
      headers: {
        'Authorization': authToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': commonUserAgent,
        'Accept-Language': commonAcceptLanguage, // Add Accept-Language header
      },
      timeout: 20000,
    });
    console.log(`Successfully proxied ${method.toUpperCase()} ${requestUrl} - Status: ${response.status}`);
    res.status(response.status).json(response.data);
  } catch (error) {
    console.error(`Error proxying to Jira for ${method.toUpperCase()} ${requestUrl}:`);
    if (error.response) {
      console.error('Jira API Error Status:', error.response.status);
      console.error('Jira API Error Headers:', JSON.stringify(error.response.headers, null, 2));
      const responseDataString = typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data, null, 2);
      console.error('Jira API Error Data:', responseDataString);
      
      const contentType = error.response.headers['content-type'];
      if (contentType && contentType.includes('text/html')) {
        console.error('Jira returned an HTML response, possibly due to WAF/auth issue (e.g., CloudFront block). Request ID from CloudFront (if present in HTML) might be useful for Atlassian support.');
        // Extract CloudFront Request ID if possible (this is a best-effort attempt)
        let cloudfrontRequestId = null;
        if (typeof error.response.data === 'string') {
            const match = error.response.data.match(/Request ID: ([^\s<]+)/);
            if (match && match[1]) {
                cloudfrontRequestId = match[1];
                console.error('CloudFront Request ID:', cloudfrontRequestId);
            }
        }
        return res.status(error.response.status || 502).json({
          error: 'Error connecting to Jira API. Jira returned an unexpected HTML response (possibly blocked by CloudFront).',
          jiraHtmlError: true,
          cloudfrontRequestId: cloudfrontRequestId, // Include Request ID if found
        });
      }
      
      res.status(error.response.status).json({
        error: 'Error from Jira API.',
        jiraErrorStatus: error.response.status,
        jiraErrorData: error.response.data,
      });
    } else if (error.request) {
      console.error('No response received from Jira:', error.message);
      res.status(504).json({ error: 'No response received from Jira (Gateway Timeout).' });
    } else {
      console.error('Error setting up Jira request:', error.message);
      res.status(500).json({ error: `Proxy internal error: ${error.message}` });
    }
  }
});

app.use((err, req, res, next) => {
  console.error("Unhandled error in proxy:", err.stack);
  res.status(500).send({ error: 'An unexpected error occurred on the proxy server!' });
});

app.listen(PORT, () => {
  console.log(`Figma to Jira Proxy Server listening on port ${PORT}`);
  console.log(`Allowed CORS origins: ${process.env.JIRA_PROXY_ALLOWED_ORIGINS || '*'}`);
});
