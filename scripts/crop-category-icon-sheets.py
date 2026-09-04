#!/usr/bin/env python3
"""Crop the generated 5x5 Clay category sheets into app-ready icons.

The image generator returns a visual transparency checkerboard rather than an
alpha channel for multi-icon sheets. This script removes only the bright,
near-neutral checkerboard region connected to each cell edge, preserving pale
details enclosed by an icon. Each silhouette is then fitted to the existing
pack's 120 px optical envelope on a 128x128 transparent canvas.

Requires Pillow and is intentionally deterministic so the checked-in source
sheets can reproduce the bundled assets.
"""

from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SHEETS_DIR = ROOT / "assets" / "icon-source-sheets" / "Clay"
PACK_DIR = ROOT / "assets" / "icon-packs" / "default"
GRID_SIZE = 5
OUTPUT_SIZE = 128
CONTENT_SIZE = 120
CELL_INSET = 10


SHEETS: list[tuple[str, list[tuple[str, str]]]] = [
    (
        "01-food-and-drink.png",
        [("Food and drink", name) for name in [
            "pizza", "taco", "ice-cream", "doughnut", "bread",
            "salad", "steak", "fish", "roast-chicken", "fried-egg",
            "fruit", "vegetables", "juice", "water-bottle", "tea",
            "milk", "cheese", "hot-dog", "french-fries", "croissant",
            "cookie", "chocolate", "soup", "pasta", "cooking-pot",
        ]],
    ),
    (
        "02-transport-and-travel.png",
        [
            ("Transport", "motorcycle"), ("Transport", "electric-car"),
            ("Transport", "ev-charger"), ("Transport", "parking-garage"),
            ("Transport", "toll-booth"), ("Transport", "ferry"),
            ("Transport", "tram"), ("Transport", "subway"),
            ("Transport", "helicopter"), ("Transport", "sailboat"),
            ("Travel", "cruise-ship"), ("Travel", "rolling-luggage"),
            ("Travel", "hotel"), ("Travel", "camping-tent"),
            ("Travel", "compass"), ("Travel", "globe"),
            ("Travel", "landmark"), ("Travel", "travel-ticket"),
            ("Travel", "location-pin"), ("Travel", "signpost"),
            ("Transport", "rental-car"), ("Travel", "road-trip"),
            ("Leisure", "skis"), ("Travel", "binoculars"),
            ("Leisure", "hammock"),
        ],
    ),
    (
        "03-home-and-bills.png",
        [
            ("Home", "apartment"), ("Bills", "utility-pole"),
            ("Bills", "gas-flame"), ("Bills", "wifi-router"),
            ("Bills", "smartphone"), ("Home", "television"),
            ("Home", "air-conditioner"), ("Home", "washing-machine"),
            ("Home", "refrigerator"), ("Home", "microwave"),
            ("Home", "vacuum-cleaner"), ("Home", "laundry-basket"),
            ("Home", "cleaning-spray"), ("Home", "hammer"),
            ("Home", "paint-roller"), ("Home", "power-drill"),
            ("Home", "toolbox"), ("Home", "garden-trowel"),
            ("Home", "trash-bin"), ("Home", "recycling-bin"),
            ("Home", "moving-boxes"), ("Bills", "home-insurance"),
            ("Bills", "property-tax"), ("Bills", "solar-panel"),
            ("Home", "fire-extinguisher"),
        ],
    ),
    (
        "04-money-and-finance.png",
        [("Money", name) for name in [
            "salary", "bonus", "investment-chart", "stocks", "bonds",
            "crypto-coin", "retirement", "emergency-fund", "taxes", "refund",
            "cashback", "interest", "personal-loan", "debt", "savings-jar",
            "budget-planner", "receipt", "currency-exchange", "money-transfer",
            "online-banking", "contactless-payment", "qr-payment", "cheque",
            "tip-jar", "donation",
        ]],
    ),
    (
        "05-health-and-wellness.png",
        [("Health", name) for name in [
            "doctor", "hospital", "ambulance", "pharmacy", "pills",
            "syringe", "thermometer", "bandage", "surgical-mask", "dentist-chair",
            "eye-care", "hearing-aid", "mental-health", "therapy", "meditation",
            "running", "swimming", "tennis", "basketball", "american-football",
            "protein-shaker", "vitamins", "sleep", "spa", "health-insurance",
        ]],
    ),
    (
        "06-shopping-and-personal-care.png",
        [("Shopping", name) for name in [
            "online-shopping", "tablet", "smartwatch", "gaming-console", "jewelry",
            "diamond-ring", "sunglasses", "hat", "jacket", "jeans",
            "socks", "boots", "high-heels", "scarf", "baby-clothes",
            "hair-salon", "barber", "perfume", "nail-polish", "skincare",
            "hair-dryer", "flowers", "stationery", "reusable-bag", "toy-blocks",
        ]],
    ),
    (
        "07-work-and-education.png",
        [("Work", name) for name in [
            "calculator", "book", "folder", "printer", "pen",
            "pencil", "ruler", "school", "university", "certificate",
            "online-course", "language-learning", "science-lab", "music-lesson",
            "art-class", "coworking", "meeting", "presentation", "work-calendar",
            "time-clock", "email", "phone-call", "freelance", "business-trip",
            "office-chair",
        ]],
    ),
    (
        "08-family-and-leisure.png",
        [
            ("Family", "couple"), ("Family", "family-group"),
            ("Family", "children"), ("Family", "elderly"),
            ("Family", "babysitting"), ("Family", "childcare"),
            ("Family", "wedding"), ("Family", "anniversary"),
            ("Family", "birthday"), ("Family", "pet-food"),
            ("Family", "veterinarian"), ("Family", "dog-walk"),
            ("Leisure", "cinema"), ("Leisure", "concert"),
            ("Leisure", "museum"), ("Leisure", "theme-park"),
            ("Leisure", "board-game"), ("Leisure", "puzzle"),
            ("Leisure", "book-club"), ("Leisure", "photography"),
            ("Leisure", "painting"), ("Leisure", "crafting"),
            ("Leisure", "gardening"), ("Other", "charity"),
            ("Other", "community"),
        ],
    ),
    (
        "09-existing-money-bills-other.png",
        [
            ("Money", "atm"), ("Money", "bank"), ("Money", "cash"),
            ("Money", "coins-checkmark"), ("Money", "coins-euro"),
            ("Money", "coins"), ("Money", "credit-card"),
            ("Money", "globe-money"), ("Money", "globe-shield"),
            ("Money", "piggy-bank"), ("Money", "purse"),
            ("Money", "wallet"), ("Bills", "bill-calendar"),
            ("Bills", "clipboard"), ("Bills", "document"),
            ("Bills", "envelope-open"), ("Bills", "envelope"),
            ("Bills", "invoice"), ("Bills", "meter"),
            ("Bills", "shield"), ("Bills", "warning"),
            ("Other", "bell"), ("Other", "bookmark"),
            ("Other", "dots"), ("Other", "magnifier"),
        ],
    ),
    (
        "10-existing-food-home-leisure.png",
        [
            ("Food and drink", "alcohol"), ("Food and drink", "bubble-tea"),
            ("Food and drink", "burger"), ("Food and drink", "coffee"),
            ("Food and drink", "cupcake"),
            ("Food and drink", "grocery-basket"), ("Food and drink", "meal"),
            ("Food and drink", "pancakes"), ("Food and drink", "ramen"),
            ("Food and drink", "sushi"), ("Home", "bed"),
            ("Home", "faucet"), ("Home", "house"), ("Home", "keys"),
            ("Home", "light-bulb"), ("Home", "potted-plant"),
            ("Home", "sofa"), ("Home", "wrench"),
            ("Leisure", "ballone"), ("Leisure", "chess-knight"),
            ("Leisure", "clapperboard"), ("Leisure", "game-controller"),
            ("Leisure", "gift"), ("Leisure", "headphone"),
            ("Other", "notification"),
        ],
    ),
    (
        "11-existing-health-family-other.png",
        [
            ("Health", "boxing-gloves"), ("Health", "dumbbell"),
            ("Health", "first-aid"), ("Health", "glasses"),
            ("Health", "heart-pulse"), ("Health", "heart"),
            ("Health", "medical-bag"), ("Health", "medicine"),
            ("Health", "stethoscope"), ("Health", "tooth"),
            ("Health", "yoga-mat"), ("Family", "baby"),
            ("Family", "balloon"), ("Family", "birthday-cake"),
            ("Family", "cat"), ("Family", "dog"),
            ("Family", "paw-print"), ("Family", "pram"),
            ("Family", "school-backpack"), ("Family", "teddy-bear"),
            ("Other", "padlock"), ("Other", "question-mark"),
            ("Other", "star"), ("Other", "target"),
            ("Shopping", "cosmetics"),
        ],
    ),
    (
        "12-existing-shopping-transport-travel.png",
        [
            ("Shopping", "dress"), ("Shopping", "handbag"),
            ("Shopping", "market-stall"), ("Shopping", "parcel"),
            ("Shopping", "price-tag"), ("Shopping", "shopping-bag"),
            ("Shopping", "sneaker"), ("Shopping", "t-shirt"),
            ("Shopping", "toiletries"), ("Shopping", "trolley"),
            ("Transport", "bicycle"), ("Transport", "bus"),
            ("Transport", "camper-van"), ("Transport", "car"),
            ("Transport", "gas-pump"), ("Transport", "plane"),
            ("Transport", "scooter"), ("Transport", "taxi"),
            ("Transport", "train"), ("Transport", "van"),
            ("Travel", "backpack"), ("Travel", "beach"),
            ("Travel", "camera-vintage"), ("Travel", "camera"),
            ("Travel", "hiking-backpack"),
        ],
    ),
    (
        "13-existing-travel-work.png",
        [
            ("Travel", "map"), ("Travel", "mountain"),
            ("Travel", "work-bag"), ("Work", "briefcase"),
            ("Work", "gear"), ("Work", "graduation-cap"),
            ("Work", "laptop"), ("Work", "monitor"),
            ("Work", "notebook"), ("Work", "office-building"),
        ],
    ),
]


def is_checker(pixel: tuple[int, int, int]) -> bool:
    high = max(pixel)
    low = min(pixel)
    return high >= 218 and high - low <= 12


def edge_connected_checker(rgb: Image.Image) -> Image.Image:
    width, height = rgb.size
    pixels = rgb.load()
    seen = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        index = y * width + x
        if not seen[index] and is_checker(pixels[x, y]):
            seen[index] = 1
            queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        if x > 0:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    alpha = Image.new("L", rgb.size, 255)
    alpha_pixels = alpha.load()
    for index, value in enumerate(seen):
        x, y = index % width, index // width
        # Also clear enclosed checker cells (inside rings, handles, glasses,
        # etc.). The artwork's light surfaces are warm cream rather than
        # neutral gray, so the chroma guard keeps them intact.
        if value or is_checker(pixels[x, y]):
            alpha_pixels[x, y] = 0
    return alpha


def remove_edge_fragments(alpha: Image.Image) -> Image.Image:
    """Remove disconnected neighbor bleed while always retaining the main icon."""
    width, height = alpha.size
    pixels = alpha.load()
    seen = bytearray(width * height)
    components: list[tuple[list[tuple[int, int]], bool]] = []

    for start_y in range(height):
        for start_x in range(width):
            start_index = start_y * width + start_x
            if seen[start_index] or pixels[start_x, start_y] == 0:
                continue
            seen[start_index] = 1
            queue = deque([(start_x, start_y)])
            points: list[tuple[int, int]] = []
            touches_edge = False
            while queue:
                x, y = queue.popleft()
                points.append((x, y))
                touches_edge = touches_edge or x <= 1 or y <= 1 or x >= width - 2 or y >= height - 2
                for neighbor_y in range(max(0, y - 1), min(height, y + 2)):
                    for neighbor_x in range(max(0, x - 1), min(width, x + 2)):
                        index = neighbor_y * width + neighbor_x
                        if not seen[index] and pixels[neighbor_x, neighbor_y] > 0:
                            seen[index] = 1
                            queue.append((neighbor_x, neighbor_y))
            components.append((points, touches_edge))

    if not components:
        return alpha
    largest = max(range(len(components)), key=lambda index: len(components[index][0]))
    cleaned = Image.new("L", alpha.size, 0)
    cleaned_pixels = cleaned.load()
    for index, (points, touches_edge) in enumerate(components):
        if index != largest and touches_edge:
            continue
        for x, y in points:
            cleaned_pixels[x, y] = pixels[x, y]
    return cleaned


def crop_icon(cell: Image.Image) -> Image.Image:
    rgb = cell.convert("RGB")
    alpha = edge_connected_checker(rgb)
    # Drop the one-pixel source fringe where generated antialiasing blended the
    # object against the pale checkerboard. At the final 128 px size this is
    # sub-pixel cleanup, not a visible contraction of the silhouette.
    alpha = alpha.filter(ImageFilter.MinFilter(3))
    alpha = remove_edge_fragments(alpha)
    rgba = rgb.convert("RGBA")
    rgba.putalpha(alpha)
    bbox = alpha.getbbox()
    if bbox is None:
        raise ValueError("cell contains no foreground pixels")

    foreground = rgba.crop(bbox)
    scale = min(CONTENT_SIZE / foreground.width, CONTENT_SIZE / foreground.height)
    size = (
        max(1, round(foreground.width * scale)),
        max(1, round(foreground.height * scale)),
    )
    foreground = foreground.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (OUTPUT_SIZE, OUTPUT_SIZE), (0, 0, 0, 0))
    position = ((OUTPUT_SIZE - size[0]) // 2, (OUTPUT_SIZE - size[1]) // 2)
    canvas.alpha_composite(foreground, position)
    return canvas


def process_sheet(sheet_name: str, icons: list[tuple[str, str]]) -> None:
    if not 1 <= len(icons) <= GRID_SIZE * GRID_SIZE:
        raise ValueError(f"{sheet_name}: expected 1-25 icon mappings, got {len(icons)}")

    sheet = Image.open(SHEETS_DIR / sheet_name).convert("RGB")
    width, height = sheet.size
    for index, (group, name) in enumerate(icons):
        row, column = divmod(index, GRID_SIZE)
        left = round(column * width / GRID_SIZE) + CELL_INSET
        top = round(row * height / GRID_SIZE) + CELL_INSET
        right = round((column + 1) * width / GRID_SIZE) - CELL_INSET
        bottom = round((row + 1) * height / GRID_SIZE) - CELL_INSET
        icon = crop_icon(sheet.crop((left, top, right, bottom)))
        output_dir = PACK_DIR / group
        output_dir.mkdir(parents=True, exist_ok=True)
        icon.save(output_dir / f"{name}.png", optimize=True)


def main() -> None:
    all_names = [name for _, icons in SHEETS for _, name in icons]
    if len(all_names) != 310 or len(set(all_names)) != 310:
        raise ValueError("sheet manifest must contain exactly 310 unique icon names")
    for sheet_name, icons in SHEETS:
        process_sheet(sheet_name, icons)
    print(f"Wrote {len(all_names)} Clay category icons to {PACK_DIR}")


if __name__ == "__main__":
    main()
