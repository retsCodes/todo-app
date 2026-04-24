require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const promClient = require('prom-client');
const app = express();

// Use PORT from environment variable or default to 3000
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('.'));

// Initialize Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Simple metrics endpoint
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Root endpoint
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Todo App</title></head>
        <body>
            <h1>Todo App is Running!</h1>
            <p>Metrics available at <a href="/metrics">/metrics</a></p>
        </body>
        </html>
    `);
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Todo app running on http://0.0.0.0:${PORT}`);
    console.log(`Metrics available at http://0.0.0.0:${PORT}/metrics`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
