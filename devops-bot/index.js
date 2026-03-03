const path = require('path');
const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const { createHealthRouter } = require('./routes/health');
const { createGitHubWebhookRouter } = require('./routes/webhooks/github');
const { createRenderWebhookRouter } = require('./routes/webhooks/render');
const { createVercelWebhookRouter } = require('./routes/webhooks/vercel');
const { initializeStandupAutomation } = require('./services/standupService');

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

async function startExpress(client) {
  const app = express();

  app.use('/webhook/github', createGitHubWebhookRouter(client));
  app.use('/webhook/render', createRenderWebhookRouter(client));
  app.use('/webhook/vercel', createVercelWebhookRouter(client));

  app.use(express.json());
  app.use('/health', createHealthRouter(client));

  const port = Number(process.env.PORT) || 3000;
  await new Promise((resolve) => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`[express] Listening on 0.0.0.0:${port}.`);
      resolve();
    });
  });
}

async function startBot() {
  requireEnv('DISCORD_TOKEN');
  requireEnv('DISCORD_CLIENT_ID');

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
