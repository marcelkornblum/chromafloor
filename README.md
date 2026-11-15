# ChromaFloor 🌈

> **Zero-Backend 2D Rainbow Floor Locator & Field Instrument for Music Festivals, Gigs, and Warehouse Raves.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-GitHub_Pages-amber?style=flat-square&logo=github)](https://marcelkornblum.github.io/chromafloor/)
[![Offline PWA](https://img.shields.io/badge/PWA-Offline_Ready-emerald?style=flat-square)](https://marcelkornblum.github.io/chromafloor/)
[![Zero Backend](https://img.shields.io/badge/Architecture-100%25_Client_Side-cyan?style=flat-square)](#zero-backend-url-state-protocol)

---

## ⚡ The Festival Problem ChromaFloor Solves

In massive festival crowds (50,000+ people), mobile cellular towers saturate within minutes. Phone texts queue indefinitely, GPS accuracy wanders by 40+ meters, and friends text useless landmarks (*"I'm near the sound booth on the left"*).

**ChromaFloor solves this with human-distinguishable 2D color space and sightlines:**
1. **Perceptual Rainbow Grid**: The dance floor is mapped across an 8×8 grid (`A1` to `H8`) with smooth, high-contrast spectral hues (`Coral`, `Amber`, `Lime`, `Mint`, `Cyan`, `Azure`, `Cobalt`, `Rose`).
2. **Interactive Venue & Room Builder**: Build and customize rooms with real-world dimensions. Place and drag fixtures directly on the floor — including **Stage**, **DJ Booth**, **Bar**, **Sound Desk**, **Speakers**, **Toilets**, **Entrance**, **Water Points**, **Cloakroom**, and **VIP/Chill areas**.
3. **Instant Visual Communication**: In WhatsApp, Telegram, or SMS, sending *"Alex is at Deep Cyan (E6)"* gives friends an instant mental model of where you are standing relative to the stage and bar.
4. **Crowd Color Beacon**: Tap **⚡ Flash Beacon** to turn your entire phone screen into a high-intensity pulsing color torch (`#08CBCF`), held aloft so friends walking into your zone spot you immediately.
5. **Walking Sightline Guide**: Locks a live guidance line from your position to any crew member on the floor, calculating exact distance (e.g. `29m · 38 steps`) and color transitions (*"Shift Vivid Mint → Bright Lime"*).
6. **Zero-Bar Offline PWA**: Installable Progressive Web App with an offline-first Service Worker (`sw.js`). Loads instantly without cellular reception in the middle of a festival field.

---

## 🌐 Live GitHub Pages Deployment

- **Production URL**: [https://marcelkornblum.github.io/chromafloor/](https://marcelkornblum.github.io/chromafloor/)
- **Relative Asset Architecture**: All CSS, SVG, JavaScript, Manifest, and Service Worker assets use strict relative paths (`./styles.css`, `./sw.js`, `./js/...`), making the app 100% portable across custom root domains, subdirectories, and offline local files.

---

## 🛠️ Custom Room & Venue Floorplan Builder

ChromaFloor gives event-goers and organizers a tactile way to lay out any music venue, gig space, warehouse, or festival field:
- **Place & Drag Fixtures**: Tap any fixture in the palette (Stage, DJ Booth, Bar, Sound Desk, Speaker, Entrance, Toilets, Water, Cloakroom, Chill, Pillar, Custom) then tap on the floor to position it. Drag fixtures freely around the floor.
- **Fixture Inspector**: Tap placed fixtures to adjust their names, change fixture types, or remove them.
- **Room Dimension Presets**: Custom width and depth scaling from 10m to 500m with automatic grid snapping.
- **Venue Sharing**: Tap **Share Layout** in the header to export custom floor plans directly via `#cf1=` hash link so all friends view the identical room and landmark layout.

---

## 🔗 Zero-Backend `#cf1=` URL Hash Protocol

ChromaFloor requires **no database, no backend server, and no user accounts**. All multi-user crew positions, custom venue configurations, room layouts, and spot notes are encoded into a compact, tamper-resilient URL hash:

```text
https://marcelkornblum.github.io/chromafloor/#cf1=<ENCODED_PAYLOAD>
```

### Hash Schema

```text
#cf1=encodeURIComponent("eventName;activeRoomId;focusPinId;pins;rooms")
```

- **Share Message Format**:
  ```text
  🌈 Alex is at Deep Cyan (E6) [#08CBCF] · Main Stage (My Event) 📍 Toward Main Bar · "Holding totem" 👥 2 crew on floor
  🔗 Open floor radar: https://marcelkornblum.github.io/chromafloor/#cf1=...
  ```

---

## 🎛️ Field Instrument Architecture

```text
chromafloor/
├── index.html            # Instrument UI shell (header, radar card, control stack, modals)
├── styles.css            # Teenage Engineering / Matte Obsidian stylesheet
├── favicon.svg           # High-DPI hardware radar SVG icon & PWA asset
├── manifest.json         # Standalone PWA web manifest
├── sw.js                 # Network-first / offline-cache Service Worker
├── .nojekyll             # Bypass Jekyll static processing on GitHub Pages
├── README.md             # Project documentation
└── js/
    ├── color-engine.js   # Spectral interpolation, 8x8 grid zones, distance/bearing math
    ├── url-state.js      # #cf1= encoder, decoder, and chat message builder
    └── app.js            # Reactive controller, canvas renderer, and gesture handler
```

---

## 🚀 Local Development & Preview

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

Open `http://localhost:8080` in your mobile or desktop browser.

---

## 🎨 Design System & Aesthetic

- **Design Philosophy**: Teenage Engineering / Pocket Operator meets outdoor wayfinding hardware.
- **Surface Palette**: Matte Obsidian dark surfaces (`#0D0F12`, `#15181D`, `#1D2128`).
- **Tactical Signals**: Amber signal (`#F59E0B`), Emerald active (`#10B981`), Cyan telemetry (`#06B6D4`).
- **Typography**: Space Grotesk (display), Plus Jakarta Sans (body), JetBrains Mono (tactical data & grid codes).
- **Daylight Mode**: High-contrast daylight theme (`[data-theme="light"]`) for intense direct sunlight at outdoor festival main stages.
