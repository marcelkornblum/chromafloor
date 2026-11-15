# ChromaFloor 🌈

> **Zero-Backend 2D Colour Wheel Crowd Locator & Venue Setup Studio for Music Festivals, Gigs, and Warehouse Raves.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-GitHub_Pages-amber?style=flat-square&logo=github)](https://marcelkornblum.github.io/chromafloor/)
[![Offline PWA](https://img.shields.io/badge/PWA-Offline_Ready-emerald?style=flat-square)](https://marcelkornblum.github.io/chromafloor/)
[![Zero Backend](https://img.shields.io/badge/Architecture-100%25_Client_Side-cyan?style=flat-square)](#zero-backend-url-hash-protocol)

---

## ⚡ The Festival Problem ChromaFloor Solves

In massive festival crowds and packed club venues, mobile cellular networks jam. Texts queue indefinitely, GPS wanders by 40+ meters indoors or under canvas, and friends send vague landmarks (*"I'm near the sound booth on the left"*).

**ChromaFloor solves this with a human-distinguishable 2D colour field and a dual-UI architecture:**
1. **2D Swirled Colour Wheel**: Unlike 1D columnar rainbows where distance from stage is ambiguous, ChromaFloor features a continuous 2D perceptual colour space (Archimedean spiral hue variation with glowing Pearl center and jewel-toned perimeter). Moving forward, back, left, or right shifts the colour distinctly across both axes.
2. **Clean Two-UI Architecture**:
   - **Sharing UI (`index.html`)**: Radically simple, single-column crowd locator (`max-width: 480px`). Contains only the room selector, 2D colour wheel, live colour swatch readout, and a single **Share / Copy My Spot** 1-click action.
   - **Setup Studio (`setup.html`)**: Dedicated venue and room configuration studio (`max-width: 1120px`). Lets organizers and attendees configure room dimensions (10m to 500m), choose colour patterns (*Swirled Wheel*, *Polar Wheel*, *Prism Wave*), and place or drag fixtures (Stage, DJ Booth, Bar, Sound Desk, Speakers, Entrance, Toilets, Water, Cloakroom, Chill / VIP, Pillar, Custom).
3. **Crowd Color Beacon**: Tap **⛶ Fullscreen** to turn your entire phone screen into a high-visibility colour torch (`#F8FAFC`, `#08CBCF`), held high above the crowd so arriving friends spot your beacon instantly.
4. **Zero-Backend URL Hash Protocol (`#cf1=`)**: Venue configurations, custom room dimensions, fixture placements, and friend spots encode into the URL hash with no database, no servers, and zero accounts.
5. **Zero-Bar Offline PWA**: Offline-first Service Worker (`sw.js` v3) caches all app assets, launching instantly even with zero phone signal in remote fields or concrete basements.

---

## 📱 The Two UIs

### 1. `index.html` — Super-Simple Sharing UI
Designed for fast, one-handed mobile use in crowded, loud environments:
- **Room Selector**: Quick tab bar switching between venue stages and rooms.
- **2D Colour Wheel**: Tactile 1:1 square canvas showing the venue floor and landmarks. Tap or drag to mark your exact spot. Flip 180° for perspective matching.
- **Your Chosen Colour**: Clear readout showing your spot's color name (*"Pearl White"*, *"Deep Cyan"*, *"Bright Lime"*), hex code, and zone coordinates (*"Zone D4 · Center"*).
- **Fullscreen Beacon**: Fills screen with high-luminance spot colour.
- **Single Share / Copy Button**: 1-click copies a formatted chat message and URL hash to clipboard and opens the native mobile share sheet.

### 2. `setup.html` — Venue & Room Setup Studio
A spacious hardware-instrument studio layout for venue planning:
- **Interactive Floorplan**: Square placement canvas with A1-H8 grid guides, 180° flip, and grid snap toggle.
- **Fixture Palette**: 12 draggable and placeable fixtures:
  - 🎸 Stage · 🎧 DJ Booth · 🍸 Bar · 🎛️ Sound Desk
  - 🔊 Speaker · 🚪 Entrance · 🚻 Toilets · 💧 Water
  - 🧥 Cloakroom · 🌿 Chill / VIP · 🏛️ Pillar · 🏷️ Custom
- **Room Properties**: Custom width and depth scaling (10m–500m), room renaming, and 2D colour pattern selection (*Swirled Colour Wheel*, *Classic Radial Wheel*, *2D Diagonal Prism Wave*).
- **One-Click Guest Link**: Generates and copies clean guest sharing links to send to attendees or crew.

---

## 🌐 Live GitHub Pages Deployment

- **Production URL**: [https://marcelkornblum.github.io/chromafloor/](https://marcelkornblum.github.io/chromafloor/)
- **Setup Studio**: [https://marcelkornblum.github.io/chromafloor/setup.html](https://marcelkornblum.github.io/chromafloor/setup.html)
- **Relative Asset Architecture**: All CSS, SVG, JavaScript, Manifest, and Service Worker assets use strict relative paths (`./styles.css`, `./sw.js`, `./js/...`), making the app 100% portable across GitHub Pages subpaths, custom domains, and local offline files.

---

## 🔗 Zero-Backend `#cf1=` URL Hash Protocol

All multi-user crew spots, venue configurations, room layouts, and landmarks are encoded into the URL hash:

```text
https://marcelkornblum.github.io/chromafloor/#cf1=<ENCODED_PAYLOAD>
```

### Share Message Format

```text
🌈 Alex is at Deep Cyan (Zone E6) [#08CBCF] · Main Stage (My Event) · Near Sound Desk
🔗 Open floor radar: https://marcelkornblum.github.io/chromafloor/#cf1=...
```

---

## 🎛️ Project Structure

```text
chromafloor/
├── index.html            # Super-Simple Sharing UI (room selector, 2D wheel, swatch, 1-click share)
├── setup.html            # Dedicated Venue & Room Setup Studio (canvas editor, fixture palette)
├── styles.css            # Obsidian/Daylight design system for both UIs (zero purple/violet)
├── favicon.svg           # High-DPI hardware radar SVG icon & PWA asset
├── manifest.json         # Standalone PWA web manifest
├── sw.js                 # Service Worker (chromafloor-v3 offline cache)
├── .nojekyll             # Bypass Jekyll static processing on GitHub Pages
├── README.md             # Project documentation
└── js/
    ├── color-engine.js   # 2D Swirled Colour Wheel, HSL math, 8x8 zones, landmark detection
    ├── url-state.js      # #cf1= encoder, decoder, and chat message builder
    ├── share-app.js      # Controller for index.html Sharing UI
    └── setup-app.js      # Controller for setup.html Venue Setup Studio
```

---

## 🚀 Local Development

Because ChromaFloor is 100% client-side, run any local HTTP server from the project directory:

```bash
# Clone the repository
git clone https://github.com/marcelkornblum/chromafloor.git
cd chromafloor

# Using Python 3
python3 -m http.server 8080

# Or using Node.js / npx
npx serve .
```

Open `http://localhost:8080` for the Sharing UI or `http://localhost:8080/setup.html` for the Venue Setup Studio.

---

## 🎨 Design System

- **Design Philosophy**: Teenage Engineering / Pocket Operator meets outdoor wayfinding hardware.
- **Surface Palette**: Matte Obsidian dark surfaces (`#0D0F12`, `#15181D`, `#1D2128`).
- **Tactical Signals**: Amber signal (`#F59E0B`), Emerald active (`#10B981`), Cyan telemetry (`#06B6D4`).
- **Typography**: Space Grotesk (display), Plus Jakarta Sans (body), JetBrains Mono (tactical data & grid codes).
- **Daylight Mode**: High-contrast daylight theme (`[data-theme="light"]`) for intense direct sunlight at outdoor festival main stages.
