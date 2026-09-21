from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton

def auction_list_kb(auctions):
    """Aktiv auksionlar ro'yxati uchun tugmalar"""
    kb = InlineKeyboardMarkup(row_width=1)
    for auc in auctions:
        kb.add(InlineKeyboardButton(
            text=f"📦 {auc[1]} | 💰 {auc[5]} tanga",
            callback_data=f"view_auc_{auc[0]}"
        ))
    return kb

def bid_kb(auction_id):
    """Bitta auksion uchun tugma"""
    kb = InlineKeyboardMarkup()
    kb.add(InlineKeyboardButton(
        text="💸 Taklif berish",
        callback_data=f"bid_{auction_id}"
    ))
    return kb 