const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const fs = require('fs');
const P = require('pino');
const settings = require('./settings.js');
const path = require('path');
const express = require('express');

const app = express();
app.use(express.json());
let sock;

// WEB PAGE FOR PAIR CODE
app.get('/', (req,res)=>{
  res.send(`
  <html><head><meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body{background:#111;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column}input{padding:12px;width:250px;border-radius:8px;border:none;margin:10px}button{padding:12px 25px;background:#25D366;border:none;border-radius:8px;font-weight:bold;cursor:pointer}h2{color:#25D366}.code{font-size:32px;letter-spacing:5px;background:#222;padding:15px;border-radius:10px;margin-top:15px;word-break:break-all} a{color:#888;margin-top:20px;font-size:13px}</style>
  </head><body>
  <h2>HEHE-M PAIR SITE</h2>
  <p>Number without + (e.g 256779997074)</p>
  <input id="num" placeholder="256779997074" value="256779997074">
  <button onclick="getCode()">Get Pair Code</button>
  <div id="result"></div>
  <a href="/clear">Clear Session If Code Fails</a>
  <script>
  async function getCode(){
    let n=document.getElementById('num').value;
    if(!n) return alert('Enter number');
    document.getElementById('result').innerHTML='Wait 5 sec... Generating one code';
    let r=await fetch('/code?number='+n);
    let d=await r.json();
    if(d.code) document.getElementById('result').innerHTML='<p>CODE FOR '+n+':</p><div class=code>'+d.code+'</div><p style=color:#25D366;margin-top:10px>Open WhatsApp > Linked Devices > Link with phone number > Enter this code WITHIN 15 SEC</p>';
    else document.getElementById('result').innerHTML='<p style=color:red>'+(d.error||'Error')+'</p>';
  }
  </script>
  </body></html>
  `);
});

app.get('/code', async (req,res)=>{
  try{
    let number = req.query.number?.replace(/[^0-9]/g,'');
    if(!number) return res.json({error:'Enter valid number'});
    if(!sock) return res.json({error:'Bot is starting, wait 10 sec and try again'});
    if(sock.authState.creds.registered) return res.json({error:'Already paired! If you want new number, tap Clear Session'});
    let code = await sock.requestPairingCode(number);
    console.log(`PAIR CODE FOR ${number}: ${code}`);
    return res.json({code});
  }catch(e){
    console.log(e);
    return res.json({error:e.message});
  }
});

app.get('/clear', async (req,res)=>{
  try{
    if(fs.existsSync('./session')) fs.rmSync('./session',{recursive:true,force:true});
    res.send('<h1>Session cleared!</h1>Now go to Render > Manual Deploy > Clear cache & Deploy. Then try again.<br><a href="/">Back</a>');
  }catch(e){res.send(e.message)}
});

app.listen(process.env.PORT || 3000, ()=> console.log('Web server running on '+ (process.env.PORT||3000)));

async function startBot(){
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('./session');

  sock = makeWASocket({
    version,
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["HEHE M", "Chrome", "1.0.0"]
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      let reason = lastDisconnect?.error?.output?.statusCode;
      console.log('Connection closed, reason:', reason);
      if (reason!== DisconnectReason.loggedOut) {
        console.log('Reconnecting in 3 sec...');
        setTimeout(startBot, 3000);
      } else {
        console.log('Logged out, clearing session');
        if(fs.existsSync('./session')) fs.rmSync('./session',{recursive:true,force:true});
        startBot();
      }
    } else if (connection === 'open') {
      console.log("HEHE M Connected ✅");
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const m = messages[0];
      if (!m.message || m.key.fromMe) return;
      const text = m.message.conversation || m.message.extendedTextMessage?.text || "";
      if (!text) return;
      if (!text.startsWith(settings.prefix)) return;
      const args = text.slice(1).trim().split(/ +/);
      const cmd = args.shift().toLowerCase();
      const pluginsFolder = './plugins';
      if (!fs.existsSync(pluginsFolder)) return;
      const files = fs.readdirSync(pluginsFolder);
      for (let file of files) {
        if (!file.endsWith('.js')) continue;
        try{
          delete require.cache[require.resolve(path.join(__dirname, 'plugins', file))];
          let plugin = require(path.join(__dirname, 'plugins', file));
          if (plugin.name === cmd || (plugin.alias && plugin.alias.includes(cmd))) {
            let fakeM = {
              chat: m.key.remoteJid,
              sender: m.key.participant || m.key.remoteJid,
              pushName: m.pushName,
              text: text,
              reply: (t) => sock.sendMessage(m.key.remoteJid, { text: t }, { quoted: m }),
            ...m
            };
            await plugin.run(fakeM, { conn: sock, args, usedPrefix: settings.prefix });
          }
        }catch(e){console.log('Plugin error', file, e.message)}
      }
    } catch (e) { console.log(e) }
  });
}
startBot();
