require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createWriteStream, existsSync, mkdirSync } = require('fs');
const path = require('path');
const WebSocket = require('ws');
const Patient = require('./models/Patient');

// Ensure logs directory exists with proper permissions
const logsDir = path.join(__dirname, 'logs');
try {
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true, mode: 0o755 });
    console.log(`Created logs directory at ${logsDir}`);
  }
} catch (err) {
  console.error(`Failed to create logs directory: ${err.message}`);
  process.exit(1);
}

// Create error log stream
const errorLogStream = createWriteStream(path.join(logsDir, 'error.log'), { flags: 'a' });

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5000;

// Database connection
mongoose.connect(process.env.MONGO_URI, {
  dbName: process.env.DB_NAME
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_MAX // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Configure middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());


// Patient registration endpoint
app.post('/api/patients', async (req, res) => {
  const patient = req.body;
  
  // Basic validation
  if (!patient.firstName || !patient.lastName || !patient.dob || !patient.gender || 
      !patient.contactNumber || !patient.email || !patient.address) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Create new patient document
  try {
    const newPatient = await Patient.create(patient);
    console.log('Patient registered successfully:', newPatient);
    res.status(201).json({ 
      message: 'Patient registered successfully',
      patient: newPatient
    });
  } catch (err) {
    const errorMessage = `[${new Date().toISOString()}] Error saving patient data: ${err.message}\n` +
                         `File path: ${dataFilePath}\n` +
                         `Error code: ${err.code}\n` +
                         `Error path: ${err.path}\n` +
                         `Stack trace: ${err.stack}\n\n`;
    
    try {
      errorLogStream.write(errorMessage);
      console.error(errorMessage);
    } catch (logErr) {
      console.error('Failed to write to error log:', logErr);
    }
    res.status(500).json({ 
      error: 'Failed to save patient data',
      details: {
        code: err.code,
        path: err.path,
        message: err.message
      }
    });
  }
});

// Patient search endpoint
app.get('/api/patients/search', async (req, res) => {
  const { name } = req.query;
  
  if (!name) {
    return res.status(400).json({ error: 'Name parameter is required' });
  }

  const searchResults = await Patient.find({
    $or: [
      { firstName: { $regex: name, $options: 'i' } },
      { lastName: { $regex: name, $options: 'i' } }
    ]
  });

  res.json(searchResults);
});

// Start the server with port fallback
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Create WebSocket server
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  ws.on('message', (message) => {
    console.log(`Received message: ${message}`);
    // Broadcast message to all clients
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

console.log(`WebSocket server running on ws://localhost:${PORT}/ws`);

// Handle port in use error
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    const fallbackPort = PORT + 1;
    console.log(`Port ${PORT} is in use, trying port ${fallbackPort}...`);
    app.listen(fallbackPort, () => {
      console.log(`Server running on port ${fallbackPort}`);
    });
  } else {
    console.error('Server error:', error);
    process.exit(1);
  }
});
