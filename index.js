const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const fs = require('fs');
const P = require('pino');
const settings = require('./settings.js');
const path = require('path');
const express = require('express');

const app = express();
app.use(express.json());
app.use(express.urlencoded({extended:true}));

let sock;

// --- PAIR SITE ---
app.get('/', (req,res)=>{
  res.send(`
  <html><head><meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body{background:#111;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column}input{padding:12px;width:250px;border-radius:8px;border:none;margin:10px}button{padding:12px 25px;background:#25D366;border:none;border-radius:8px;font-weight:bold;cursor:pointer}h2{color:#25D366}.code{font-size:32px;letter-spacing:5px;background:#222;padding:15px;border-radius:10px;margin-top:15px}a{color:#888;margin-top:20px;font-size:12px}</style>
  </head><body>
  <h2>HEHE-M BOT PAIR</h2>
  <p>Enter number with country code (no +)</p>
  <input id="num" placeholder="256779997074" value="256779997074">
  <button onclick="getCode()">Get Pair Code</button>
  <div id="result"></div>
  <a href="/clear">Clear Session (if code not working)</a>
  <script>
  async function getCode(){
    let n=document.getElementById('num').value;
    if(!n) return alert('Enter number');
    document.getElementById('result').innerHTML='Generating... wait 5 sec';
    let r=await fetch('/code?number='+n);
    let d=await r.json();
    if(d.code) document.getElementById('result').innerHTML='<p>CODE FOR '+n+':</p><div class=code>'+d.code+'</div><p style=color:#25D366>Enter FAST in WhatsApp > Linked Devices > Link with phone number</p><p>Code expires in 20 sec!</p>';
    else document.getElementById('result').innerHTML='<p style=color:red>'+d.error+'</p>';
  }
  </script>
  </body></html>
  `);
});

app.get('/code', async (req,res)=>{
  try{
    let number = req.query.number?.replace(/[^0-9]/g,'');
    if(!number) return res.json({error:'Invalid number'});
    if(!sock) return res.json({error:'Bot starting, wait 10sec'});
    if(sock.authState.creds.registered) return res.json({error:'Already paired! Go clear session if you want new number'});

    let code = await sock.requestPairingCode(number);
    console.log(`PAIR CODE FOR ${number}: ${code}`);
    return res.json({code});
  }catch(e){
    return res.json({error:e.message});
  }
});

app.get('/clear', async (req,res)=>{
  try{
    if(fs.existsSync('./session')) fs.rmSync('./session',{recursive:true,force:true});
    res.send('Session cleared! Go back and deploy again on Render. <a href="/">Back</a>');
  }catch(e){res.send(e.message)}
});

app.listen(process.env.PORT || 3000, ()=> console.log('Web server running'));

async function startBot(){
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  sock = makeWASocket({
    version,
    auth: state,
    logger: P({level:"silent"}),
    printQRInTerminal:false,
    browser:["HEHE M","Chrome","1.0"]
  });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (u)=>{
    const {connection, lastDisconnect} = u;
    if(connection==='close'){
      let reason = lastDisconnect?.error?.output?.statusCode;
      console.log('Closed', reason);
      if(reason!== DisconnectReason.loggedOut) setTimeout(startBot, 3000);
    } else if(connection==='open'){
      console.log("HEHE M Connected ✅");
    }
  });
  sock.ev.on('messages.upsert', async ({messages})=>{
    try{
      const m=messages[0]; if(!m.message||m.key.fromMe) return;
      let text=m.message.conversation||m.message.extendedTextMessage?.text||""; if(!text) return;
      let isCmd=text.startsWith(settings.prefix);
      let body=isCmd?text.slice(1).trim():text.trim(); let args=body.split(/ +/); let cmd=args.shift().toLowerCase();
      for(let file of fs.readdirSync("./plugins")){
        if(!file.endsWith(".js")) continue;
        delete require.cache[require.resolve(path.join(__dirname,"plugins",file))];
        let plugin=require(path.join(__dirname,"plugins",file));
        if(plugin.name===cmd||(plugin.alias&&plugin.alias.includes(cmd))||(!isCmd&&plugin.name==="wordchain")){
          let fakeM={chat:m.key.remoteJid,sender:m.key.participant||m.key.remoteJid,pushName:m.pushName,text:text,reply:(t)=>sock.sendMessage(m.key.remoteJid,{text:t},{quoted:m}),...m};
          await plugin.run(fakeM,{conn:sock,args:isCmd?args:[text],usedPrefix:settings.prefix});
        }
      }
    }catch(e){console.log(e.message)}
  });
}
startBot();
