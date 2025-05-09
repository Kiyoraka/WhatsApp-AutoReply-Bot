// Dependencies to install:
// npm install whatsapp-web.js express qrcode-terminal qrcode socket.io

const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const qrcode = require('qrcode');
const socketIO = require('socket.io');
const http = require('http');
const path = require('path');
const qrcode_terminal = require('qrcode-terminal');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const port = process.env.PORT || 8000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Configure the keywords and responses
let keywordResponses = [
    {
        keywords: ['hello', 'hi', 'hey', 'salam', 'selamat'],
        response: 'Salam kenal'
    },
    {
        keywords: ['tengah', 'buat', 'apa', 'tu', 'keluar'],
        response: 'Saya sedang tidur'
    }
];

// Welcome message for new users
let welcomeMessage = "Selamat datang ke Portal Rasmi Kerajaan Negeri Perak! Saya adalah bot bantuan automatik. Bagaimana saya boleh membantu anda hari ini?";

// Track users who have already been greeted
let greetedUsers = new Set();

// Clear greeted users list at midnight each day to reset greetings
function scheduleDailyReset() {
  const now = new Date();
  const night = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1, // tomorrow
    0, // midnight
    0, 
    0
  );
  const timeToMidnight = night.getTime() - now.getTime();
  
  setTimeout(() => {
    console.log('Clearing greeted users list for the day');
    greetedUsers.clear();
    scheduleDailyReset(); // Schedule the next day's reset
  }, timeToMidnight);
  
  console.log(`Scheduled greeted users reset in ${Math.floor(timeToMidnight / 1000 / 60)} minutes`);
}

// Route to update keyword responses
app.post('/update-responses', (req, res) => {
  if (req.body.keywordResponses) {
    keywordResponses = req.body.keywordResponses;
    res.json({ success: true, message: 'Responses updated successfully' });
  } else {
    res.status(400).json({ success: false, message: 'Invalid data format' });
  }
});

// Route to update welcome message
app.post('/update-greeting', (req, res) => {
  if (req.body.welcomeMessage) {
    welcomeMessage = req.body.welcomeMessage;
    res.json({ success: true, message: 'Greeting message updated successfully' });
  } else {
    res.status(400).json({ success: false, message: 'Invalid data format' });
  }
});

// Initialize WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './whatsapp-session' // Specify a persistent directory for Railway
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--single-process', // Important for Railway deployment
      '--disable-extensions'
    ]
  }
});

// QR code handler
client.on('qr', (qr) => {
  console.log('QR RECEIVED');
  
  // Display QR in terminal for headless environments
  qrcode_terminal.generate(qr, { small: true });
  
  // Generate QR code as image and send to client
  qrcode.toDataURL(qr, (err, url) => {
    if (err) {
      console.error('Error generating QR code URL:', err);
      return;
    }
    console.log('QR code URL generated');
    io.emit('qr', { url });
  });
});

// When client is ready
client.on('ready', () => {
  console.log('Client is ready!');
  io.emit('ready', { message: 'WhatsApp is connected!' });
  
  // Schedule the daily reset of greeted users
  scheduleDailyReset();
});

// When client is authenticated
client.on('authenticated', () => {
  console.log('Client is authenticated!');
  io.emit('authenticated', { message: 'WhatsApp is authenticated!' });
});

// When authentication fails
client.on('auth_failure', (msg) => {
  console.error('Authentication failure', msg);
  io.emit('auth_failure', { message: 'Authentication failed!' });
});

// When disconnected
client.on('disconnected', (reason) => {
  console.log('Client was disconnected', reason);
  io.emit('disconnected', { message: 'WhatsApp was disconnected!' });
  // Reinitialize the client
  client.initialize();
});

// Handle incoming messages
client.on('message', async (msg) => {
  // Get the chat ID from the message
  const chatId = msg.from;
  const messageText = msg.body.toLowerCase();
  let replied = false;
  
  // If this is a first message from a user today, send the welcome message
  if (!greetedUsers.has(chatId)) {
    try {
      await client.sendMessage(chatId, welcomeMessage);
      console.log(`Sent welcome message to new user: ${chatId}`);
      greetedUsers.add(chatId);
      replied = true;
      io.emit('message', { 
        from: chatId, 
        body: messageText, 
        replied: true,
        autoGreeting: true
      });
    } catch (error) {
      console.error('Error sending welcome message:', error);
    }
  }

  // Existing keyword response logic
  for (const item of keywordResponses) {
    // Look for any matching keywords in the message
    const hasKeyword = item.keywords.some(keyword => 
      messageText.includes(keyword.toLowerCase())
    );
    
    if (hasKeyword) {
      try {
        await msg.reply(item.response);
        console.log(`Replied to message with keyword match: ${messageText}`);
        replied = true;
        break; // Stop checking after the first match
      } catch (error) {
        console.error('Error sending reply:', error);
      }
    }
  }

  // Log the incoming message and whether we replied
  console.log(`Received message: ${messageText} - Replied: ${replied}`);
  if (!replied || !greetedUsers.has(chatId)) {
    io.emit('message', { from: chatId, body: messageText, replied });
  }
});

// Socket connection
io.on('connection', (socket) => {
  console.log('A user connected');
  socket.emit('config', { 
    keywordResponses,
    welcomeMessage 
  });

  // Listen for manual message send
  socket.on('send-message', async (data) => {
    const { number, message } = data;
    if (number && message) {
      try {
        const formattedNumber = number.includes('@c.us') ? number : `${number}@c.us`;
        await client.sendMessage(formattedNumber, message);
        socket.emit('message-sent', { success: true, to: formattedNumber, message });
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('message-sent', { success: false, error: error.message });
      }
    }
  });

  // Update keyword responses
  socket.on('update-responses', (data) => {
    keywordResponses = data.keywordResponses;
    io.emit('config', { 
      keywordResponses,
      welcomeMessage 
    });
  });
  
  // Update greeting message
  socket.on('update-greeting', (data) => {
    if (data.welcomeMessage) {
      welcomeMessage = data.welcomeMessage;
      io.emit('config', { 
        keywordResponses,
        welcomeMessage 
      });
    }
  });
});

// Initialize the client
client.initialize();

// Start the server
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});