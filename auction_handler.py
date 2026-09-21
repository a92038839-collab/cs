from aiogram import Router, F, types
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from datetime import datetime, timedelta

from config import ADMINS
from auction_db import (
    get_active_auctions, get_auction, place_bid,
    create_auction, finish_auction
)
from auction_kb import auction_list_kb, bid_kb

router = Router()

# --- Holatlar (FSM) ---
class BidState(StatesGroup):
    waiting_amount = State()

class AdminAuction(StatesGroup):
    photo = State()
    name = State()
    desc = State()
    price = State()


# ==================== FOYDALANUVCHI TOMONI ====================

@router.message(F.text == "🔨 Auksion")
async def show_auctions(message: types.Message):
    """Auksionlar ro'yxatini ko'rsatish"""
    auctions = await get_active_auctions()
    if not auctions:
        await message.answer("Hozircha aktiv auksionlar yo'q. Keyinroq urinib ko'ring.")
        return
    await message.answer(
        "🔨 <b>Aktiv auksionlar</b>\n\nKerakli mahsulotni tanlang:",
        reply_markup=auction_list_kb(auctions)
    )


@router.callback_query(F.data.startswith("view_auc_"))
async def view_auction(call: types.CallbackQuery):
    """Bitta auksion haqida ma'lumot"""
    auc_id = int(call.data.split("_")[2])
    auc = await get_auction(auc_id)

    if not auc:
        await call.answer("Auksion topilmadi!", show_alert=True)
        return

    # Qolgan vaqtni hisoblash
    end_time = datetime.strptime(auc[8], "%Y-%m-%d %H:%M:%S")
    now = datetime.now()
    if now >= end_time:
        await call.answer("Bu auksion tugagan!", show_alert=True)
        return

    remaining = end_time - now
    hours = remaining.seconds // 3600
    minutes = (remaining.seconds % 3600) // 60

    top_bidder = auc[7] if auc[7] else "Hali yo'q"

    text = (
        f"📦 <b>{auc[1]}</b>\n\n"
        f"📝 {auc[2]}\n\n"
        f"💰 Boshlang'ich narx: {auc[4]} tanga\n"
        f"🔥 Hozirgi narx: <b>{auc[5]} tanga</b>\n"
        f"👤 Eng yuqori taklif: {top_bidder}\n"
        f"⏰ Qolgan vaqt: {hours} soat {minutes} daqiqa"
    )

    await call.message.answer_photo(
        photo=auc[3],
        caption=text,
        reply_markup=bid_kb(auc_id)
    )
    await call.answer()


@router.callback_query(F.data.startswith("bid_"))
async def start_bid(call: types.CallbackQuery, state: FSMContext):
    """Taklif berishni boshlash"""
    auc_id = int(call.data.split("_")[1])
    await state.update_data(auction_id=auc_id)
    await call.message.answer(
        "💸 Qancha tanga taklif qilasiz?\n"
        "(Faqat raqam kiriting, masalan: 150)"
    )
    await state.set_state(BidState.waiting_amount)
    await call.answer()


@router.message(BidState.waiting_amount)
async def process_bid(message: types.Message, state: FSMContext):
    """Taklifni qabul qilish"""
    if not message.text.isdigit():
        await message.answer("❌ Iltimos, faqat raqam kiriting!")
        return

    amount = int(message.text)
    data = await state.get_data()
    auc_id = data['auction_id']
    auc = await get_auction(auc_id)

    # Tekshiruvlar
    if not auc:
        await message.answer("❌ Auksion topilmadi!")
        await state.clear()
        return

    if amount <= auc[5]:
        await message.answer(
            f"❌ Taklif hozirgi narxdan (<b>{auc[5]} tanga</b>) katta bo'lishi kerak!"
        )
        return

    # Taklifni saqlash
    username = f"@{message.from_user.username}" if message.from_user.username else message.from_user.full_name
    await place_bid(auc_id, message.from_user.id, username, amount)

    await message.answer(
        f"✅ <b>Taklifingiz qabul qilindi!</b>\n\n"
        f"📦 Mahsulot: {auc[1]}\n"
        f"💰 Sizning taklifingiz: {amount} tanga\n\n"
        f"Auksion tugashiga qadar kuting!"
    )
    await state.clear()


# ==================== ADMIN TOMONI ====================

@router.message(F.text == "➕ Yangi Auksion")
async def new_auction(message: types.Message, state: FSMContext):
    """Yangi auksion yaratishni boshlash (faqat admin)"""
    if message.from_user.id not in ADMINS:
        return

    await message.answer("📸 Mahsulot rasmini yuboring:")
    await state.set_state(AdminAuction.photo)


@router.message(AdminAuction.photo, F.photo)
async def get_photo(message: types.Message, state: FSMContext):
    await state.update_data(photo=message.photo[-1].file_id)
    await message.answer("📝 Mahsulot nomini kiriting:")
    await state.set_state(AdminAuction.name)


@router.message(AdminAuction.name)
async def get_name(message: types.Message, state: FSMContext):
    await state.update_data(name=message.text)
    await message.answer("📄 Tavsifni kiriting:")
    await state.set_state(AdminAuction.desc)


@router.message(AdminAuction.desc)
async def get_desc(message: types.Message, state: FSMContext):
    await state.update_data(desc=message.text)
    await message.answer("💰 Boshlang'ich narxni kiriting (raqamda):")
    await state.set_state(AdminAuction.price)


@router.message(AdminAuction.price)
async def get_price(message: types.Message, state: FSMContext):
    if not message.text.isdigit():
        await message.answer("❌ Faqat raqam kiriting!")
        return

    data = await state.get_data()
    end_time = (datetime.now() + timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")

    await create_auction(
        name=data['name'],
        desc=data['desc'],
        photo=data['photo'],
        start_price=int(message.text),
        end_time=end_time
    )

    await message.answer(
        f"✅ <b>Auksion yaratildi!</b>\n\n"
        f"📦 {data['name']}\n"
        f"💰 Boshlang'ich narx: {message.text} tanga\n"
        f"⏰ 24 soatdan keyin avtomatik yopiladi."
    )
    await state.clear() 