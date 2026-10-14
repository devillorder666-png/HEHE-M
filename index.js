const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const P = require('pino');
const settings = require('./settings.js');
const path = require('path');
const express = require('express');

// FIX FOR RENDER PORT ERROR
const app = express();
app.get('/', (req,res)=> res.send('HEHE M BOT IS RUNNING'));
app.listen(process.env.PORT || 3000, ()=> console.log('Web server running'));

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState('./session');
  const sock = makeWASocket({
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
    if(!sock.authState.creds.registered){
      setTimeout(async()=>{
        try{
          let c=await sock.requestPairingCode(settings.pairNumber);
          console.log("==================================");
          console.log("PAIR CODE FOR "+settings.pairNumber+": "+c);
          console.log("==================================");
        }catch(e){ console.log("Pair error:",e.message); }
      },5000);
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
