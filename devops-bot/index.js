const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const { createHealthRouter } = require('./routes/health');
const { createGitHubWebhookRouter } = require('./routes/webhooks/github');
const { createRenderWebhookRouter } = require('./routes/webhooks/render');
const { createVercelWebhookRouter } = require('./routes/webhooks/vercel');
const { createDashboardRouter } = require('./routes/dashboard');
const { createAnalyticsApiRouter } = require('./routes/api/analytics');
const { createTasksApiRouter } = require('./routes/api/tasks');
const { createBugsApiRouter } = require('./routes/api/bugs');
const { createDeploymentsApiRouter } = require('./routes/api/deployments');
const { createStandupsApiRouter } = require('./routes/api/standups');
const { initializeStandupAutomation } = require('./services/standupService');
const { initializeDashboardSocket } = require('./dashboard/socket');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function loadCommands(client) {
  const commandsPath = path.join(__dirname, 'commands');
  const categories = fs.readdirSync(commandsPath, { withFileTypes: true }).filter((dirent) => dirent.isDirectory());

  for (const category of categories) {
    const categoryPath = path.join(commandsPath, category.name);
    const commandFiles = fs
      .readdirSync(categoryPath)
      .filter((file) => file.endsWith('.js'));

    for (const file of commandFiles) {
      const commandPath = path.join(categoryPath, file);
      const command = require(commandPath);

      if (!command?.data?.name || typeof command.execute !== 'function') {
        console.warn(`[commands] Skipping invalid command module: ${commandPath}`);
        continue;
      }

      client.commands.set(command.data.name, command);
    }
  }

  console.log(`[commands] Loaded ${client.commands.size} command(s).`);
}

function loadEvents(client) {
  const eventsPath = path.join(__dirname, 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

  for (const file of eventFiles) {
    const eventPath = path.join(eventsPath, file);
    const event = require(eventPath);

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }

  console.log(`[events] Loaded ${eventFiles.length} event handler(s).`);
}

async function connectDatabase() {
  const mongoUri = requireEnv('MONGODB_URI');
  await mongoose.connect(mongoUri);
  console.log('[database] Connected to MongoDB.');
}

function createSessionMiddleware() {
  const sessionSecret = requireEnv('SESSION_SECRET');
  const mongoUri = requireEnv('MONGODB_URI');

  return session({
    name: 'core_dashboard.sid',
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    store: MongoStore.create({
      mongoUrl: mongoUri,
      ttl: 60 * 60 * 8,
      autoRemove: 'native'
    }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8
    }
  });
}

async function startExpress(client) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: true,
      credentials: true
    }
  });

  initializeDashboardSocket(io);

  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use('/webhook/github', createGitHubWebhookRouter(client));
  app.use('/webhook/render', createRenderWebhookRouter(client));
  app.use('/webhook/vercel', createVercelWebhookRouter(client));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use('/public', express.static(path.join(__dirname, 'public')));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 180,
    standardHeaders: true,
    legacyHeaders: false
  });

  const sessionMiddleware = createSessionMiddleware();
  app.use(sessionMiddleware);

  app.use('/health', createHealthRouter(client));
  app.use('/', authLimiter, createDashboardRouter());

  app.use('/api/analytics', apiLimiter, createAnalyticsApiRouter(client));
  app.use('/api/tasks', apiLimiter, createTasksApiRouter());
  app.use('/api/bugs', apiLimiter, createBugsApiRouter());
  app.use('/api/deployments', apiLimiter, createDeploymentsApiRouter());
  app.use('/api/standups', apiLimiter, createStandupsApiRouter());

  const port = Number(process.env.PORT) || 3000;
  await new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      console.log(`[express] Listening on 0.0.0.0:${port}.`);
      resolve();
    });
  });
}

async function startBot() {
  requireEnv('DISCORD_TOKEN');
  requireEnv('DISCORD_CLIENT_ID');
  requireEnv('CLIENT_ID');
  requireEnv('CLIENT_SECRET');
  requireEnv('REDIRECT_URI');
  requireEnv('SESSION_SECRET');

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.DirectMessages
    ]
  });

  client.commands = new Collection();

  loadCommands(client);
  loadEvents(client);
  initializeStandupAutomation(client);

  await connectDatabase();
  await startExpress(client);
  await client.login(process.env.DISCORD_TOKEN);
}

startBot().catch((error) => {
  console.error('[startup] Failed to start bot:', error);
  process.exit(1);
});
