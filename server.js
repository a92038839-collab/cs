
require("dotenv").config();

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { Pool } = require("pg");
const crypto = require("crypto");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL;
const DATABASE_URL = process.env.DATABASE_URL;

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN topilmadi!");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("DATABASE_URL topilmadi!");
  process.exit(1);
}

/* =========================
   DATABASE
========================= */

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/* =========================
   TELEGRAM BOT
========================= */

const bot = new TelegramBot(BOT_TOKEN, {
  polling: true
});

/* =========================
   EXPRESS
========================= */

app.use(express.json());

app.use(
  express.static(path.join(__dirname, "web"))
);

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "web", "index.html")
  );
});

/* =========================
   DATABASE TABLE
========================= */

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      language TEXT DEFAULT 'uz',
      coins BIGINT DEFAULT 0,
      clicks BIGINT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log("Database tayyor.");
}

/* =========================
   TELEGRAM INIT DATA
========================= */

function validateTelegramInitData(initData) {

  if (!initData) {
    return null;
  }

  const params = new URLSearchParams(initData);

  const hash = params.get("hash");

  if (!hash) {
    return null;
  }

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(BOT_TOKEN)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (calculatedHash !== hash) {
    return null;
  }

  const userString = params.get("user");

  if (!userString) {
    return null;
  }

  try {
    return JSON.parse(userString);
  } catch {
    return null;
  }
}

/* =========================
   CREATE / GET USER
========================= */

async function getOrCreateUser(telegramUser) {

  const result = await pool.query(
    `
    INSERT INTO users
      (
        telegram_id,
        username,
        first_name
      )
    VALUES
      ($1, $2, $3)

    ON CONFLICT (telegram_id)
    DO UPDATE SET
      username = EXCLUDED.username,
      first_name = EXCLUDED.first_name,
      updated_at = CURRENT_TIMESTAMP

    RETURNING *;
    `,
    [
      telegramUser.id,
      telegramUser.username || null,
      telegramUser.first_name || "Player"
    ]
  );

  return result.rows[0];
}

/* =========================
   USER INFO
========================= */

app.post("/api/user", async (req, res) => {

  try {

    const { initData } = req.body;

    const telegramUser =
      validateTelegramInitData(initData);

    if (!telegramUser) {
      return res.status(401).json({
        success: false,
        message: "Telegram ma'lumotlari noto'g'ri"
      });
    }

    const user =
      await getOrCreateUser(telegramUser);

    res.json({
      success: true,

      user: {
        telegram_id: user.telegram_id,
        username: user.username,
        first_name: user.first_name,
        language: user.language,
        coins: Number(user.coins),
        clicks: Number(user.clicks)
      }
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server xatosi"
    });

  }

});

/* =========================
   TAP COIN
========================= */

app.post("/api/tap", async (req, res) => {

  try {

    const { initData, amount } = req.body;

    const telegramUser =
      validateTelegramInitData(initData);

    if (!telegramUser) {
      return res.status(401).json({
        success: false,
        message: "Telegram ma'lumotlari noto'g'ri"
      });
    }

    const tapAmount =
      Number(amount) || 1;

    if (
      !Number.isInteger(tapAmount) ||
      tapAmount < 1 ||
      tapAmount > 10
    ) {
      return res.status(400).json({
        success: false,
        message: "Noto'g'ri coin miqdori"
      });
    }

    await getOrCreateUser(telegramUser);

    const result = await pool.query(
      `
      UPDATE users

      SET
        coins = coins + $1,
        clicks = clicks + 1,
        updated_at = CURRENT_TIMESTAMP

      WHERE telegram_id = $2

      RETURNING coins, clicks;
      `,
      [
        tapAmount,
        telegramUser.id
      ]
    );

    res.json({
      success: true,
      coins: Number(result.rows[0].coins),
      clicks: Number(result.rows[0].clicks)
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Coin qo'shishda xatolik"
    });

  }

});

/* =========================
   TELEGRAM /START
========================= */

bot.onText(/\/start/, async (msg) => {

  try {

    await bot.sendMessage(
      msg.chat.id,

      "🎮 CS COIN\n\n" +
      "🪙 Coin yig'ing!\n" +
      "🔨 Auksionlarda qatnashing!\n" +
      "🏆 Reytingda yuqoriga chiqing!",

      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🪙 CS COIN OCHISH",

                web_app: {
                  url: WEB_APP_URL
                }
              }
            ]
          ]
        }
      }
    );

  } catch (error) {

    console.error(
      "Telegram xatosi:",
      error.message
    );

  }

});

/* =========================
   START SERVER
========================= */

async function startServer() {

  try {

    await initDatabase();

    app.listen(PORT, () => {

      console.log(
        `CS COIN server ${PORT} portda ishlayapti`
      );

    });

  } catch (error) {

    console.error(
      "Database xatosi:",
      error
    );

    process.exit(1);
  }

}

startServer();