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
const ADMIN_ID = String(process.env.ADMIN_ID || "");

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN topilmadi!");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL topilmadi!");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const bot = new TelegramBot(BOT_TOKEN, {
  polling: true
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "web")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "web", "index.html"));
});

/* =========================
   DATABASE
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT NOT NULL,
      stars INTEGER NOT NULL,
      coins INTEGER NOT NULL,
      telegram_payment_id TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log("Database tayyor.");
}

/* =========================
   TELEGRAM INIT DATA
========================= */

function validateTelegramInitData(initData) {

  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) return null;

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

  try {
    return JSON.parse(params.get("user"));
  } catch {
    return null;
  }
}

/* =========================
   USER
========================= */

async function getOrCreateUser(telegramUser) {

  const result = await pool.query(
    `
    INSERT INTO users
      (telegram_id, username, first_name)
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

    const user = validateTelegramInitData(
      req.body.initData
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Telegram user aniqlanmadi"
      });
    }

    const dbUser =
      await getOrCreateUser(user);

    res.json({
      success: true,

      user: {
        telegram_id: dbUser.telegram_id,
        username: dbUser.username,
        first_name: dbUser.first_name,
        coins: Number(dbUser.coins),
        clicks: Number(dbUser.clicks)
      }
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false
    });

  }

});

/* =========================
   TAP COIN
========================= */

app.post("/api/tap", async (req, res) => {

  try {

    const user = validateTelegramInitData(
      req.body.initData
    );

    if (!user) {
      return res.status(401).json({
        success: false
      });
    }

    await getOrCreateUser(user);

    const result = await pool.query(
      `
      UPDATE users
      SET
        coins = coins + 1,
        clicks = clicks + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = $1
      RETURNING coins, clicks;
      `,
      [user.id]
    );

    res.json({
      success: true,
      coins: Number(result.rows[0].coins),
      clicks: Number(result.rows[0].clicks)
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false
    });

  }

});

/* =========================
   BUY COINS WITH STARS
========================= */

const STAR_PACKAGES = {
  1: 100,
  10: 1000,
  50: 5000,
  100: 10000
};

app.post("/api/create-payment", async (req, res) => {

  try {

    const user = validateTelegramInitData(
      req.body.initData
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Telegram user aniqlanmadi"
      });
    }

    const stars = Number(req.body.stars);
    const coins = STAR_PACKAGES[stars];

    if (!coins) {
      return res.status(400).json({
        success: false,
        message: "Noto'g'ri paket"
      });
    }

    const payload =
      `coins_${user.id}_${stars}_${Date.now()}`;

    await bot.sendInvoice(
      user.id,

      "CS COIN",

      `${stars} ⭐ = ${coins.toLocaleString()} CS COIN`,

      payload,

      "XTR",

      [
        {
          label: `${coins.toLocaleString()} CS COIN`,
          amount: stars
        }
      ],

      {
        provider_token: "",
        need_name: false,
        need_phone_number: false,
        need_email: false,
        need_shipping_address: false
      }
    );

    res.json({
      success: true,
      message: "Invoice Telegramga yuborildi"
    });

  } catch (error) {

    console.error("Payment error:", error);

    res.status(500).json({
      success: false,
      message: "To'lov yaratilmadi"
    });

  }

});

/* =========================
   PRE CHECKOUT
========================= */

bot.on("pre_checkout_query", async (query) => {

  try {

    await bot.answerPreCheckoutQuery(
      query.id,
      true
    );

  } catch (error) {

    console.error(
      "Pre checkout error:",
      error
    );

  }

});

/* =========================
   SUCCESSFUL PAYMENT
========================= */

bot.on("message", async (msg) => {

  if (!msg.successful_payment) {
    return;
  }

  try {

    const payment =
      msg.successful_payment;

    const telegramId =
      msg.from.id;

    const stars =
      Number(payment.total_amount);

    const coins =
      STAR_PACKAGES[stars];

    if (!coins) {
      console.error(
        "Noma'lum Stars paketi:",
        stars
      );

      return;
    }

    const paymentId =
      payment.telegram_payment_charge_id;

    const existing =
      await pool.query(
        `
        SELECT id
        FROM payments
        WHERE telegram_payment_id = $1
        `,
        [paymentId]
      );

    if (existing.rows.length > 0) {
      return;
    }

    await pool.query(
      `
      INSERT INTO payments
        (
          telegram_id,
          stars,
          coins,
          telegram_payment_id
        )
      VALUES
        ($1, $2, $3, $4)
      `,
      [
        telegramId,
        stars,
        coins,
        paymentId
      ]
    );

    await pool.query(
      `
      UPDATE users
      SET
        coins = coins + $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE telegram_id = $2
      `,
      [
        coins,
        telegramId
      ]
    );

    await bot.sendMessage(
      telegramId,

      `✅ To'lov muvaffaqiyatli!\n\n` +
      `⭐ ${stars} Stars\n` +
      `🪙 +${coins.toLocaleString()} CS COIN`
    );

  } catch (error) {

    console.error(
      "Successful payment error:",
      error
    );

  }

});

/* =========================
   START
========================= */

bot.onText(/\/start/, async (msg) => {

  try {

    await bot.sendMessage(
      msg.chat.id,

      "🎮 CS COIN\n\n" +
      "🪙 Coin yig'ing\n" +
      "⭐ Stars orqali coin sotib oling\n" +
      "🔨 Auksionlarda qatnashing",

      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🎮 CS COIN OCHISH",
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

    console.error(error);

  }

});

/* =========================
   SERVER
========================= */

async function startServer() {

  try {

    await initDatabase();

    app.listen(PORT, () => {

      console.log(
        `CS COIN ${PORT} portda ishlayapti`
      );

    });

  } catch (error) {

    console.error(
      "Server xatosi:",
      error
    );

    process.exit(1);
  }

}

startServer();