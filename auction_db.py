import aiosqlite
from datetime import datetime

DB_NAME = "cs_coin.db"

# --- Jadval yaratish ---
async def init_auction_db():
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS auctions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_name TEXT,
                description TEXT,
                photo_id TEXT,
                start_price INTEGER,
                current_price INTEGER,
                top_bidder_id INTEGER,
                top_bidder_name TEXT,
                end_time TEXT,
                status TEXT DEFAULT 'active'
            )
        """)
        await db.commit()

# --- Yangi auksion yaratish ---
async def create_auction(name, desc, photo, start_price, end_time):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute("""
            INSERT INTO auctions 
            (product_name, description, photo_id, start_price, current_price, end_time)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (name, desc, photo, start_price, start_price, end_time))
        await db.commit()

# --- Aktiv auksionlar ro'yxati ---
async def get_active_auctions():
    async with aiosqlite.connect(DB_NAME) as db:
        async with db.execute(
            "SELECT * FROM auctions WHERE status = 'active' ORDER BY id DESC"
        ) as cursor:
            return await cursor.fetchall()

# --- Bitta auksionni olish ---
async def get_auction(auction_id):
    async with aiosqlite.connect(DB_NAME) as db:
        async with db.execute(
            "SELECT * FROM auctions WHERE id = ?", (auction_id,)
        ) as cursor:
            return await cursor.fetchone()

# --- Taklif berish ---
async def place_bid(auction_id, user_id, username, amount):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute("""
            UPDATE auctions 
            SET current_price = ?, top_bidder_id = ?, top_bidder_name = ?
            WHERE id = ?
        """, (amount, user_id, username, auction_id))
        await db.commit()

# --- Auksionni tugatish ---
async def finish_auction(auction_id):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute(
            "UPDATE auctions SET status = 'finished' WHERE id = ?",
            (auction_id,)
        )
        await db.commit() 