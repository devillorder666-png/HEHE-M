const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const fs = require('fs');
const settings = require('./settings.js');

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const sock = makeWASocket({ auth: state, printQRInTerminal: false, browser: ["HEHE M", "Chrome", "1.0"] });

  // Auto load plugins
  const plugins = fs.readdirSync('./plugins');
  console.log(`Loaded ${plugins.length} plugins`);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (u) => {
    if (u.connection === "open") console.log("HEHE M Connected to " + settings.pairNumber);
  });

  // auto restart when file added
  fs.watch('./plugins', (event, filename) => {
    if (filename) {
      console.log(`Plugin ${filename} changed, restarting...`);
      process.exit(0); // panel will auto restart
    }
  });
}
startBot();
