const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { rateLimit } = require('express-rate-limit');
const { isSafeSvg, hasSvgExtension } = require('./svgValidation');
const { selectChurchLogoFilePath } = require('./logoStorage');

const app = express();

// Set up persistent data directory
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const configFile = path.join(dataDir, 'config.json');
const bundledChurchLogoFile = path.join(__dirname, '..', 'assets', 'church-logo.svg');
const churchLogoFile = path.join(dataDir, 'church-logo.svg');

let appConfig = null;
let setupMode = true;
let transporter = null;

function loadConfig() {
  if (fs.existsSync(configFile)) {
    try {
      appConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      if (appConfig.firebaseConfig && appConfig.serviceAccount && appConfig.appName) {
        setupMode = false;

        // Initialize Firebase Admin
        if (admin.apps.length === 0) {
          admin.initializeApp({
            credential: admin.credential.cert(appConfig.serviceAccount),
            databaseURL: appConfig.firebaseConfig.databaseURL
          });
        }

        // Initialize Nodemailer if SMTP info is provided
        if (appConfig.smtp) {
          transporter = nodemailer.createTransport({
            host: appConfig.smtp.host,
            port: appConfig.smtp.port,
            secure: appConfig.smtp.secure,
            auth: {
              user: appConfig.smtp.user,
              pass: appConfig.smtp.pass
            }
          });
        }
        console.log("Configuration loaded successfully. Setup mode: false");
      }
    } catch (err) {
      console.error("Error reading config file:", err);
    }
  } else {
    console.log("No config file found. Starting in setup mode.");
  }
}

// Initial load
loadConfig();
app.use(cors());
app.use(express.json());

// --- Setup Middleware ---
app.use((req, res, next) => {
  // Always allow access to setup API, setup.html, and assets
  if (
    req.path.startsWith('/api/setup') ||
    req.path === '/setup.html' ||
    req.path.startsWith('/assets/') ||
    req.path.startsWith('/api/status') // allow checking status
  ) {
    return next();
  }

  // If in setup mode, redirect to setup page for root, else block API calls
  if (setupMode) {
    if (req.path === '/' || req.path === '/index.html') {
      return res.redirect('/setup.html');
    }
    return res.status(503).json({ error: 'App is in setup mode. Please configure first.' });
  }

  // If setup is complete but they try to access setup page, redirect to root
  if (!setupMode && req.path === '/setup.html') {
    return res.redirect('/');
  }

  next();
});

// Dynamic Config Route (Replaces assets/config.js)
app.get('/assets/config.js', (req, res) => {
  if (setupMode || !appConfig || !appConfig.firebaseConfig) {
    return res.status(503).send('// App not configured yet');
  }

  const jsConfig = `
export const config = {
    firebaseConfig: ${JSON.stringify(appConfig.firebaseConfig, null, 4)},
    apiBaseUrl: window.location.origin + "/api",
    appName: "${appConfig.appName}"
};
`;
  res.setHeader('Content-Type', 'application/javascript');
  res.send(jsConfig);
});

// Serve specific frontend static files (Avoid serving the entire /app directory for security)
const frontendDir = path.join(__dirname, '..');
const logoAssetRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});
app.get('/assets/church-logo.svg', logoAssetRateLimit, (req, res, next) => {
  const logoFilePath = selectChurchLogoFilePath(churchLogoFile, bundledChurchLogoFile);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(logoFilePath, (error) => {
    if (error) next(error);
  });
});
app.use('/assets', express.static(path.join(frontendDir, 'assets')));
app.get('/sw.js', (req, res) => res.sendFile(path.join(frontendDir, 'sw.js')));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(frontendDir, 'manifest.json')));
app.get('/setup.html', (req, res) => res.sendFile(path.join(frontendDir, 'setup.html')));

// Catch-all for SPA fallback (serves index.html for root)
app.get('*', (req, res, next) => {
    // Only serve index.html for GET requests that don't match other routes (like APIs)
    if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.startsWith('/data/')) {
         return res.sendFile(path.join(frontendDir, 'index.html'));
    }
    next();
});

// Route to check setup status
app.get('/api/status', (req, res) => {
  res.json({ setupMode });
});

// Set up Local Storage using Multer
const uploadDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // 1. Get the data sent from the frontend
    const rawName = req.body.name || 'Unbekannt';
    const rawDate = req.body.date || new Date().toISOString().split('T')[0];

    // 2. Sanitize to prevent invalid filename characters
    const safeName = rawName.replace(/[^a-zA-Z0-9]/g, '_');
    const safeDate = rawDate.replace(/[^0-9-]/g, ''); 
    const ext = path.extname(file.originalname); // Keep the original extension (.jpg, .png)

    const prefix = `${safeName}-${safeDate}-`;

    // 3. Find existing files with the same prefix to determine the counter
    fs.readdir(uploadDir, (err, files) => {
      let counter = 1;
      
      if (!err && files) {
        // Filter files that match the prefix and the extension
        const matchingFiles = files.filter(f => f.startsWith(prefix) && f.endsWith(ext));
        
        if (matchingFiles.length > 0) {
          // Extract counters from existing files and find the max
          const counters = matchingFiles.map(f => {
            const parts = f.replace(ext, '').split('-');
            const lastPart = parts[parts.length - 1];
            return parseInt(lastPart) || 0;
          });
          counter = Math.max(...counters) + 1;
        }
      }
      
      // 4. Finalize the filename
      const finalFilename = `${prefix}${counter}${ext}`;
      cb(null, finalFilename);
    });
  }
});
const upload = multer({ storage });
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const adminRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/admin', adminRateLimit);

// Security Middleware: Verify Firebase ID Token
const verifyToken = async (req, res, next) => {
  if (setupMode) {
    return res.status(503).send('App is in setup mode. Please complete setup first.');
  }
  if (admin.apps.length === 0) {
    return res.status(503).send('Authentication service unavailable. Please check Firebase configuration.');
  }

  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).send('Unauthorized');
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    res.status(401).send('Invalid token');
  }
};

const verifySuperAdmin = async (req, res, next) => {
  try {
    const userSnap = await admin.database().ref(`users/${req.user.uid}`).once('value');
    if (!userSnap.exists() || userSnap.val().superAdmin !== true) {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    next();
  } catch (error) {
    console.error('Failed to verify super admin:', error);
    res.status(500).json({ error: 'Failed to verify permissions' });
  }
};


// --- Setup Route ---
app.post('/api/setup', (req, res) => {
  if (!setupMode) {
    return res.status(403).json({ error: 'Setup already complete.' });
  }

  const { appName, firebaseConfig, serviceAccount, smtp } = req.body;

  if (!appName || !firebaseConfig || !serviceAccount) {
    return res.status(400).json({ error: 'Missing required configuration data.' });
  }

  const newConfig = {
    appName,
    firebaseConfig,
    serviceAccount,
    smtp: smtp || null
  };

  try {
    // Attempt to initialize Admin SDK with provided credentials first
    if (admin.apps.length === 0) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert(newConfig.serviceAccount),
          databaseURL: newConfig.firebaseConfig.databaseURL
        });
      } catch (err) {
        return res.status(400).json({ error: 'Invalid Firebase Service Account or Config: ' + err.message });
      }
    } else {
        // if already initialized, we might need to recreate the instance if we are allowing re-setup,
        // but since setupMode is true, this is likely the first initialization.
    }

    // Initialize SMTP if provided
    if (newConfig.smtp) {
      try {
        transporter = nodemailer.createTransport({
          host: newConfig.smtp.host,
          port: newConfig.smtp.port,
          secure: newConfig.smtp.secure,
          auth: {
            user: newConfig.smtp.user,
            pass: newConfig.smtp.pass
          }
        });
      } catch (err) {
         console.warn("SMTP Init failed:", err.message);
         // we might still allow it to continue, but let's assume valid data
      }
    }

    // Save only after successful initialization
    fs.writeFileSync(configFile, JSON.stringify(newConfig, null, 2), 'utf8');
    appConfig = newConfig;

    setupMode = false;
    res.json({ success: true, message: 'Setup completed successfully.' });
  } catch (error) {
    console.error("Error saving configuration:", error);
    res.status(500).json({ error: 'Failed to save configuration.' });
  }
});

app.post('/api/admin/bootstrap-super-admin', verifyToken, async (req, res) => {
  try {
    const superAdminRef = admin.database().ref('system/superAdminUid');
    const txResult = await superAdminRef.transaction(current => current || req.user.uid);
    const superAdminUid = txResult.snapshot.val();
    const isSuperAdmin = superAdminUid === req.user.uid;

    if (isSuperAdmin) {
      await admin.database().ref(`users/${req.user.uid}`).update({
        admin: true,
        superAdmin: true,
        email: req.user.email || null
      });
    }

    res.json({
      isSuperAdmin,
      superAdminUid,
      createdNow: txResult.committed
    });
  } catch (error) {
    console.error('Failed to bootstrap super admin:', error);
    res.status(500).json({ error: 'Failed to bootstrap super admin' });
  }
});

app.get('/api/admin/system-config', verifyToken, verifySuperAdmin, async (req, res) => {
  if (!appConfig) {
    return res.status(404).json({ error: 'No config found' });
  }
  res.json({
    appName: appConfig.appName,
    firebaseConfig: appConfig.firebaseConfig || {},
    serviceAccount: appConfig.serviceAccount || {},
    smtp: appConfig.smtp || null
  });
});

app.put('/api/admin/system-config', verifyToken, verifySuperAdmin, async (req, res) => {
  try {
    const { appName, firebaseConfig, serviceAccount, smtp } = req.body || {};
    if (!appName || !firebaseConfig || !serviceAccount) {
      return res.status(400).json({ error: 'Missing required config fields' });
    }

    const newConfig = {
      appName,
      firebaseConfig,
      serviceAccount,
      smtp: smtp || null
    };

    fs.writeFileSync(configFile, JSON.stringify(newConfig, null, 2), 'utf8');
    appConfig = newConfig;

    if (newConfig.smtp) {
      transporter = nodemailer.createTransport({
        host: newConfig.smtp.host,
        port: newConfig.smtp.port,
        secure: newConfig.smtp.secure,
        auth: {
          user: newConfig.smtp.user,
          pass: newConfig.smtp.pass
        }
      });
    } else {
      transporter = null;
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update system config:', error);
    res.status(500).json({ error: 'Failed to update system config' });
  }
});

app.put('/api/admin/users/:uid/admin', verifyToken, verifySuperAdmin, async (req, res) => {
  try {
    const { uid } = req.params;
    const makeAdmin = req.body?.admin === true;

    const superAdminSnap = await admin.database().ref('system/superAdminUid').once('value');
    const superAdminUid = superAdminSnap.exists() ? superAdminSnap.val() : null;

    if (uid === superAdminUid && !makeAdmin) {
      return res.status(400).json({ error: 'Super admin cannot lose admin rights' });
    }

    const updates = { admin: makeAdmin };
    if (uid !== superAdminUid) {
      updates.superAdmin = false;
    }

    await admin.database().ref(`users/${uid}`).update(updates);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update admin role:', error);
    res.status(500).json({ error: 'Failed to update admin role' });
  }
});

app.post('/api/admin/logo', verifyToken, verifySuperAdmin, (req, res) => {
  logoUpload.single('logo')(req, res, async (uploadError) => {
    if (uploadError) {
      console.error('Multer error:', uploadError);
      if (uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Logo file too large (max 5MB)' });
      }
      return res.status(400).json({ error: 'Invalid logo upload: ' + uploadError.message });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No logo file uploaded' });
      }

      const originalName = req.file.originalname || '';
      const ext = path.extname(originalName).toLowerCase();
      const mimeType = (req.file.mimetype || '').toLowerCase();

      if (!hasSvgExtension(originalName)) {
        console.error('SVG Validation Failed (hasSvgExtension):', originalName);
        return res.status(400).json({ error: 'Only SVG files are allowed (Invalid extension)' });
      }
      // For extensionless files, rely on MIME type when the browser provides one.
      // Files with .svg extension are still validated via isSafeSvg content checks below.
      if (!ext && mimeType && mimeType !== 'image/svg+xml') {
        console.error('SVG Validation Failed (MIME type mismatch):', originalName, mimeType);
        return res.status(400).json({ error: 'Only SVG files are allowed (Invalid MIME type)' });
      }

      const content = req.file.buffer.toString('utf8');
      if (!isSafeSvg(content)) {
        console.error('SVG Validation Failed (isSafeSvg):', originalName);
        return res.status(400).json({ error: 'Invalid SVG file (Contains invalid tags or scripts)' });
      }

      await fs.promises.writeFile(churchLogoFile, content, 'utf8');
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to update logo:', error);
      res.status(500).json({ error: 'Failed to update logo: ' + error.message });
    }
  });
});

// Route: Upload a receipt
app.post('/api/upload', verifyToken, upload.single('receipt'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');
  res.json({ filename: req.file.filename });
});

// Route: Fetch a receipt
app.get('/api/receipts/:filename', verifyToken, (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('File not found');
  }
});

// --- NEW: Route to Send Neutral Emails ---
app.post('/api/send-email', verifyToken, async (req, res) => {
    try {
        const { to, subject, text, html } = req.body;

        if (!to || !subject) {
            return res.status(400).json({ error: 'Missing required fields: to, subject' });
        }

        if (!transporter) return res.status(500).json({ error: 'SMTP not configured' });

        const mailOptions = {
            from: `"${appConfig.appName}" <${appConfig.smtp.user}>`,
            to: to,
            subject: subject,
            text: text,
            html: html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent: %s', info.messageId);
        
        res.status(200).json({ success: true, messageId: info.messageId });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// Route to Notify Admins of a New Request
app.post('/api/notify-admins', verifyToken, async (req, res) => {
    try {
        const { reqType, personName } = req.body;

        if (!reqType || !personName) {
            return res.status(400).json({ error: 'Missing required fields: reqType, personName' });
        }

        // Map request types to German labels
        const typeLabels = { payment: 'Zahlung', status: 'Status', expense: 'Ausgabe', standing_order: 'Dauerauftrag' };
        const reqTypeLabel = typeLabels[reqType] || reqType;

        // Fetch ALL users securely from the backend using the Admin SDK
        const usersSnap = await admin.database().ref('users').once('value');
        if (!usersSnap.exists()) {
            return res.status(404).json({ error: 'No users found in database' });
        }

        const allUsers = usersSnap.val();
        
        // Filter out only the admins who have an email address
        const adminEmails = Object.values(allUsers)
            .filter(u => u.admin === true && u.email && u.emailNotifications === true)
            .map(u => u.email);

        if (adminEmails.length === 0) {
            return res.status(200).json({ message: 'No admins found to notify' });
        }

        if (!transporter) return res.status(500).json({ error: 'SMTP not configured' });

        // Send the email to all admins at once using an array
        const mailOptions = {
            from: `"${appConfig.appName}" <${appConfig.smtp.user}>`,
            to: adminEmails, 
            subject: `Neue Anfrage bei ${appConfig.appName}`,
            text: `Eine neue Anfrage (${reqTypeLabel}) von ${personName} wurde eingereicht.\n\nBitte prüfe die Anfrage in der App.`
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Admin notification sent successfully: %s', info.messageId);
        
        res.status(200).json({ success: true, messageId: info.messageId });
    } catch (error) {
        console.error('Error notifying admins:', error);
        res.status(500).json({ error: 'Failed to notify admins' });
    }
});
// -----------------------------------------

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
