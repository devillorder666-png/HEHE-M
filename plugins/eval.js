module.exports = {
  name: "eval",
  alias: ["e", ">", "ev"],
  category: "Owner",
  desc: "Eval for owner",
  async run(m, { conn, args }) {
    const owner = ["256792930216@s.whatsapp.net"];
    if (!owner.includes(m.sender)) return m.reply("❌ Owner only!");
    try {
      let code = args.join(" ");
      if (!code) return m.reply("Type code to eval");
      let result = await eval(`(async()=>{ ${code} })()`);
      if (typeof result!== "string") result = require('util').inspect(result);
      m.reply(result || "Done");
    } catch (e) {
      m.reply("Error: " + e.message);
    }
  }
      }
