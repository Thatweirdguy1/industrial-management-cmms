import sqlite3
import qrcode
import os
from PIL import Image, ImageDraw, ImageFont

# --- CONFIGURATION ---
# Public base URL of the dashboard. Must be the HTTPS domain technicians' phones
# can actually reach - a localhost URL produces stickers that only work on the
# server, and a bare http:// IP disables the microphone (the Web Speech API used
# for dictation only runs on a secure origin).
BASE_URL = os.environ.get("QR_BASE_URL", "http://localhost:3000").rstrip("/")
OUTPUT_DIR = "qr_codes"
LABELED_DIR = "labeled_qrs"

# Sticker geometry, matching the previously printed batch.
CANVAS = (330, 410)
QR_BOX = 290
QR_POS = (20, 60)


def load_font(size, bold=False):
    """Best-effort TrueType lookup so the sticker text is legible when printed.

    Pillow's built-in bitmap font is tiny and unreadable at sticker size, so try
    the usual Windows / Linux faces first and only fall back if none are present.
    """
    candidates = (
        ["arialbd.ttf", "DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf"] if bold
        else ["arial.ttf", "DejaVuSans.ttf", "LiberationSans-Regular.ttf"]
    )
    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def shrink_to_fit(draw, text, size, bold, max_width):
    """Step the font down until the text fits the sticker width."""
    while size > 9:
        font = load_font(size, bold)
        if draw.textlength(text, font=font) <= max_width:
            return font
        size -= 1
    return load_font(9, bold)


def make_labeled_sticker(qr_img, machine_id, name, tag):
    """QR plus human-readable text, so a sticker is still usable if it won't scan."""
    canvas = Image.new("RGB", CANVAS, "white")
    # Paste at native size, horizontally centred. Rescaling to an exact pixel box
    # would give modules uneven widths, which is what makes a printed code hard to
    # read - so the caller sizes the QR to an integer px-per-module instead.
    canvas.paste(qr_img, ((CANVAS[0] - qr_img.width) // 2, QR_POS[1]))

    draw = ImageDraw.Draw(canvas)
    max_width = CANVAS[0] - 20
    draw.text((10, 13), name, font=shrink_to_fit(draw, name, 26, True, max_width), fill="black")
    footer = f"ID: {machine_id} | Tag: {tag}"
    draw.text((10, 378), footer, font=shrink_to_fit(draw, footer, 18, False, max_width), fill="#555555")
    return canvas


def generate_stickers():
    conn = None
    try:
        conn = sqlite3.connect("maintenance.db")
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, asset_tag FROM machines ORDER BY id")
        machines = cursor.fetchall()

        if not machines:
            print("No machines found in the database. Run init_db.py first.")
            return

        if "localhost" in BASE_URL or BASE_URL.startswith("http://"):
            print(f"WARNING: BASE_URL is {BASE_URL}")
            print("         Set QR_BASE_URL to your public HTTPS domain before printing stickers.")

        os.makedirs(OUTPUT_DIR, exist_ok=True)
        os.makedirs(LABELED_DIR, exist_ok=True)

        for m_id, name, tag in machines:
            # The exact URL the QR code will open. Must match the mobile route in
            # frontend/app/m/page.tsx, which reads the machine from ?id=.
            # The id comes straight from the machines table, so always regenerate
            # after re-seeding the database - the ids move and old stickers then
            # point at the wrong machine.
            url = f"{BASE_URL}/m?id={m_id}"

            # Error correction Q (~25%) rather than the default M: these stickers
            # live on oily machine frames and pick up scuffs.
            qr = qrcode.QRCode(
                version=None,
                error_correction=qrcode.constants.ERROR_CORRECT_Q,
                box_size=10,
                border=4,
            )
            qr.add_data(url)
            qr.make(fit=True)

            safe_tag = tag.replace("/", "-") if tag else "NO-TAG"
            filename = f"ID{m_id:03d}_{safe_tag}.png"

            # Plain sticker: full resolution for printing at any size.
            qr.make_image(fill_color="black", back_color="white").convert("RGB").save(
                os.path.join(OUTPUT_DIR, filename)
            )

            # Labeled sticker: largest whole number of pixels per module that still
            # fits QR_BOX once the 4-module quiet zone is included.
            span = qr.modules_count + 2 * qr.border
            qr.box_size = max(1, QR_BOX // span)
            small = qr.make_image(fill_color="black", back_color="white").convert("RGB")
            make_labeled_sticker(small, m_id, name or "UNNAMED", tag or "NO-TAG").save(
                os.path.join(LABELED_DIR, filename)
            )

        print(f"Generated {len(machines)} QR codes in '{OUTPUT_DIR}' and '{LABELED_DIR}'.")
        print(f"Encoded URL pattern: {BASE_URL}/m?id=<machine_id>")

    except sqlite3.Error as e:
        print(f"Database error: {e}")
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    generate_stickers()
