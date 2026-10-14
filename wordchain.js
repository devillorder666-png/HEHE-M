const axios = require('axios');
let games = {};

module.exports = {
  name: "wordchain",
  alias: ["wrchain","wc","chain"],
  category: "Games",
  desc: "Word Chain 2-8 players",
  async run(m, { conn, args, usedPrefix }) {
    const chatId = m.chat;
    const sender = m.sender;
    const senderName = m.pushName || sender.split('@')[0];

    if (!games[chatId]) games[chatId] = { players: [], active: false, words: [], turnIndex: 0, timer: null, lastLetter: "" };
    let game = games[chatId];

    const cmd = (args[0] || "").toLowerCase();

    // JOIN
    if (cmd === "join") {
      if (game.active) return m.reply("❌ Game already started! Wait for next round.");
      if (game.players.find(p => p.id === sender)) return m.reply("✅ You already joined!");
      if (game.players.length >= 8) return m.reply("❌ Full! Max 8 players.");

      game.players.push({ id: sender, name: senderName });
      return conn.sendMessage(chatId, { text: `✅ *${senderName}* joined! (${game.players.length}/8)\n\nPlayers: ${game.players.map(p=>`@${p.id.split('@')[0]}`).join(', ')}\n\nType *.wrchain join* to join\n*.wrchain start* to start (need 2+ players)`, mentions: game.players.map(p=>p.id) });
    }

    // START
    if (cmd === "start") {
      if (game.players.length < 2) return m.reply("❌ Need at least 2 players. Type.wrchain join");
      if (game.active) return m.reply("Game already running!");
      game.active = true;
      game.words = [];
      game.lastLetter = "";
      game.turnIndex = 0;
      return conn.sendMessage(chatId, { text: `🎮 *WORD CHAIN STARTED - HEHE M*\n\nTurn: @${game.players[0].id.split('@')[0]}\n\nYou have 40 seconds!\nSend any word to begin! First word can be anything.\n\nRule: No repeat, must be real English word (checked via Google Dictionary)`, mentions: [game.players[0].id] }, { quoted: m });
    }

    // STOP
    if (cmd === "stop" || cmd === "end") {
      clearTimeout(game.timer);
      games[chatId] = null;
      return m.reply("🛑 Game stopped and cleared.");
    }

    // SHOW PLAYERS
    if (cmd === "players" || cmd === "list") {
      if (!game.players.length) return m.reply("No players yet..wrchain join");
      return conn.sendMessage(chatId, { text: `Players (${game.players.length}):\n${game.players.map((p,i)=>`${i+1}. @${p.id.split('@')[0]} ${i===game.turnIndex && game.active? '👉 TURN' : ''}`).join('\n')}`, mentions: game.players.map(p=>p.id) });
    }

    // IF NOT ACTIVE, SHOW HELP
    if (!game.active) {
      return m.reply(`*🔤 HEHE M - WORDCHAIN*\n\n.wrchain join - Join game (2-8 players)\n.wrchain start - Start game\n.wrchain stop - Stop game\n.wrchain players - List players\n\nJust type a word when it's your turn.`);
    }

    // ONLY CURRENT PLAYER CAN PLAY
    let currentPlayer = game.players[game.turnIndex];
    if (sender!== currentPlayer.id) return; // silent ignore if not your turn

    let word = (args.join(" ") || m.text || "").trim().toLowerCase().split(" ")[0];
    if (!word || word.length < 2 ||!/^[a-z]+$/.test(word)) return;

    // 1. CHECK LAST LETTER RULE
    if (game.lastLetter &&!word.startsWith(game.lastLetter)) {
      return m.reply(`❌ @${sender.split('@')[0]} must start with *${game.lastLetter.toUpperCase()}*\nLast word: *${game.words[game.words.length-1]}*`, { mentions: [sender] });
    }

    // 2. CHECK REPEAT
    if (game.words.includes(word)) {
      return m.reply(`❌ Word *${word}* already used! You are eliminated!`, { mentions: [sender] });
    }

    // 3. GOOGLE DICTIONARY CHECK
    try {
      let res = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
      if (!res.data ||!res.data[0]) throw "invalid";
    } catch (e) {
      return m.reply(`❌ *${word}* is not a valid English word! Try again @${sender.split('@')[0]}\n(Checked via Google Dictionary)`, { mentions: [sender] });
    }

    // VALID WORD
    clearTimeout(game.timer);
    game.words.push(word);
    game.lastLetter = word.slice(-1);

    // CHECK WINNER - if only 1 left after previous eliminations, but now we go next
    game.turnIndex = (game.turnIndex + 1) % game.players.length;
    let nextPlayer = game.players[game.turnIndex];

    await conn.sendMessage(chatId, {
      text: `✅ *${word.toUpperCase()}* accepted by @${sender.split('@')[0]}!\n\n📝 Words: ${game.words.length}\n🔤 Next letter: *${game.lastLetter.toUpperCase()}*\n\n👉 Turn: @${nextPlayer.id.split('@')[0]} - You have 40 seconds!`,
      mentions: [sender, nextPlayer.id]
    });

    // 40 SECOND TIMER
    game.timer = setTimeout(async () => {
      // Eliminate current player who didn't answer
      let eliminated = game.players[game.turnIndex];
      await conn.sendMessage(chatId, { text: `⏰ Time up! @${eliminated.id.split('@')[0]} failed in 40s and is ELIMINATED! 💀`, mentions: [eliminated.id] });

      game.players.splice(game.turnIndex, 1);

      if (game.players.length === 1) {
        let winner = game.players[0];
        await conn.sendMessage(chatId, { text: `🏆 *GAME OVER! WINNER IS @${winner.id.split('@')[0]}* 🎉🎉\n\nTotal words: ${game.words.join(", ")}`, mentions: [winner.id] });
        games[chatId] = null; // auto restart ready
      } else if (game.players.length === 0) {
        await conn.sendMessage(chatId, { text: `🏁 No players left! Game over.` });
        games[chatId] = null;
      } else {
        // adjust index
        if (game.turnIndex >= game.players.length) game.turnIndex = 0;
        let newTurn = game.players[game.turnIndex];
        await conn.sendMessage(chatId, { text: `Next turn: @${newTurn.id.split('@')[0]} | Letter: *${game.lastLetter.toUpperCase()}*`, mentions: [newTurn.id] });
        // restart timer for next player (reuse same logic)
        // We set new timer
        game.timer = setTimeout(async () => {
           // will be handled in next round loop, we call elimination again
           let el = game.players[game.turnIndex];
           await conn.sendMessage(chatId, { text: `⏰ @${el.id.split('@')[0]} eliminated (40s)`, mentions: [el.id] });
           game.players.splice(game.turnIndex, 1);
           if (game.players.length === 1) {
             await conn.sendMessage(chatId, { text: `🏆 WINNER @${game.players[0].id.split('@')[0]}`, mentions: [game.players[0].id] });
             games[chatId] = null;
           }
        }, 40000);
      }
    }, 40000); // 40 seconds

  }
}
