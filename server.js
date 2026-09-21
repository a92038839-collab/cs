require("dotenv").config();

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL;

if (!BOT_TOKEN) {
  console.log("BOT_TOKEN topilmadi!");
  process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, {
  polling: true
});

app.use(express.json());

app.use(express.static(path.join(__dirname, "web")));

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "web", "index.html")
  );
});

bot.onText(/\/start/, async (msg) => {

  const chatId = msg.chat.id;

  await bot.sendMessage(
    chatId,
    "🎮 CS COIN\n\n🪙 Coin yig‘ing va auksionlarda qatnashing!",
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "🪙 CS COIN",
              web_app: {
                url: WEB_APP_URL
              }
            }
          ]
        ]
      }
    }
  );

});

app.listen(PORT, () => {
  console.log(
    `CS BOT server ${PORT} portda ishlayapti`
  );
});