const express = require('express');
const mongoose = require('mongoose');
const promClient = require('prom-client');
const app = express();

// Load environment variables
require('dotenv').config();

app.use(express.json());
app.use(express.static('.'));

// Initialize Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

// Use environment variables for sensitive data
const GRAFANA_USERNAME = process.env.GRAFANA_USERNAME;
const GRAFANA_API_TOKEN = process.env.GRAFANA_API_TOKEN;

// Rest of your server.js code...
// (make sure no hardcoded tokens!)

console.log('Todo app starting with environment variables');
