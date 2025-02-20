const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { createWriteStream, existsSync, mkdirSync } = require('fs');

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

const app = express();
const PORT = 5000;

// Configure body-parser middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Ensure data directory exists with proper permissions
const dataDir = path.join(__dirname, 'data');
try {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true, mode: 0o755 });
    console.log(`Created data directory at ${dataDir}`);
  }
} catch (err) {
  console.error(`Failed to create data directory: ${err.message}`);
  process.exit(1);
}

// File path for persistent storage
const dataFilePath = path.join(dataDir, 'patients.json');

// Load patients from file or initialize empty array
let patients = [];
try {
  if (fs.existsSync(dataFilePath)) {
    patients = JSON.parse(fs.readFileSync(dataFilePath));
  }
} catch (err) {
  console.error('Error loading patients data:', err);
}

// Patient registration endpoint
app.post('/api/patients', (req, res) => {
  const patient = req.body;
  
  // Basic validation
  if (!patient.firstName || !patient.lastName || !patient.dob || !patient.gender || 
      !patient.contactNumber || !patient.email || !patient.address) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Add patient to storage
  patients.push(patient);
  
  // Save to file
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(patients));
    console.log(`Patient data saved successfully to ${dataFilePath}`);
    res.status(201).json({ message: 'Patient registered successfully', patient });
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
app.get('/api/patients/search', (req, res) => {
  const { name } = req.query;
  
  if (!name) {
    return res.status(400).json({ error: 'Name parameter is required' });
  }

  const searchResults = patients.filter(patient => 
    patient.firstName.toLowerCase().includes(name.toLowerCase()) || 
    patient.lastName.toLowerCase().includes(name.toLowerCase())
  );

  res.json(searchResults);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
