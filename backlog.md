# ChromaFloor Product & Technical Backlog

This document outlines the next major milestones for **ChromaFloor** — taking it from a single-screen color-wheel coordinator into an effortless, on-the-dancefloor group radar and collaborative venue map network.

---

## 1. Group Session Onboarding (Shared Link vs. Bare Landing)

### The Problem
In loud festival tents and warehouse raves, friends join crews in different ways:
1. Some tap a WhatsApp/Telegram link or scan a physical phone QR code while dancing together.
2. Others hear about the tool by word-of-mouth or open the bare website (`chromafloor.com` / `marcelkornblum.github.io/chromafloor/`) with no context or group URL.

### User Experience
- **Direct Group Link / QR Code (`?g=<id>` or `#g=<id>`)**:
  - Instantly drops the user into that group's active venue layout and live crew radar.
  - Zero splash screens or onboarding forms: user enters their name (or keeps a fun auto-generated raver handle like *"Neon Fox"*), picks their personal color, and sees their friends immediately on the floor map.
- **Bare URL (`/`)**:
  - Clean, distraction-free two-option landing card:
    1. **Create a Group**:
       - Starts a fresh group session with an easy 4-character short code (e.g. `BANG-42` or `RAVE-09`).
       - Loads either a nearby saved venue (see Section 3) or the default venue template.
    2. **Join a Group with Short Code**:
       - Big, friendly numeric/alphanumeric keypad input for entering a 4–6 character group code shouted across a loud room or sent in a quick SMS (`"join BANG-42"`).
       - Automatically resolves to the group session ID without having to copy-paste messy URLs.

---

## 2. On-the-Dancefloor Multi-Rectangle Room Sketcher + Emojis

### The Problem
Real dancefloors are rarely perfect squares: they have side bars, L-shaped chillout annexes, narrow entrance corridors, backstage paths, and mezzanine balconies. Venue organizers and clubbers need a 10-second way to sketch an approximate floorplan *while standing in the crowd*, using only one thumb.

### Mobile-First Touch Canvas
- **Multi-Rectangle Composite Shape**:
  - Start with a primary dancefloor rectangle.
  - One-tap `+ Add Section` button to drag and snap adjacent rectangles (e.g. side bar strip on the right, L-annex behind the sound desk, or entrance funnel at the back).
  - Continuous unified border with soft glowing architectural walls.
- **Continuous 2D Colour Field Mapping**:
  - The 2D Colour Wheel smoothly maps and clips across the composite multi-rectangle polygon.
  - Single continuous coordinate space: coordinates in side annexes or balconies seamlessly get unique hue/lightness zones.
- **Required Architectural Stage Block**:
  - Every room has exactly one primary Stage block (`🎸 Stage`) anchored as the navigational reference point.
  - Cannot be deleted — only repositioned (front rail, side stage, center 360° booth).
  - Orientation hints ("Facing Stage ↑", "Facing Away From Stage ↓") calculate automatically relative to the user's spot.
- **Free-Form Rave Emojis & Optional Labels**:
  - Rapid one-tap placement for essential festival infrastructure:
    - Sound & Vision: `🔊` (Speakers), `🎛️` (Sound Desk / FOH), `🪩` (Mirrorball), `🎧` (DJ)
    - Amenities: `🚻` (Loos / WC), `🍸` (Cocktail Bar), `🍺` (Beer), `💧` (Free Water Point), `🍔` (Food), `🧥` (Cloakroom)
    - Safety & Navigation: `🚪` (Emergency Exit / Entrance), `🪜` (Stairs / Balcony), `🚑` (First Aid / Welfare), `🚬` (Smoking Area), `🛋️` (Chill Seating), `🚩` (Totem / Flag), `⭐` (Meet Point)
  - Pure emoji markers by default for high visual clarity, with optional cartographic labels (e.g. `"Left Stack"`, `"Portaloos"`, `"VIP Bar"`) rendered with crisp outdoor text halos.

---

## 3. Group Map Persistence & 30-Day Public Geotagged Venue Discovery

### The Concept
When someone meticulously configures a venue layout (e.g., Boomtown Sector 6, BangFace Bang Room, Printworks Press Halls), everyone else at that event should benefit from that map without needing an account or re-drawing it from scratch.

### Flow
1. **Private by Default**:
   - Every group created is completely private and accessible only via its secret link / short code.
2. **Optional "Publicly Geotag This Venue Map"**:
   - The creator can toggle a switch: **"Make this venue layout discoverable to other groups nearby"**.
   - Auto-expires and cleans up after **30 days** (covers festival weekends and club nights cleanly).
3. **Privacy-Preserving Payload**:
   - The public discovery index stores **only**:
     - Venue / Event Name (e.g. `"BangFace — Bang Room"`)
     - Room dimensions, composite shapes, stage position, and emoji markers.
     - Coarse venue coordinates (approximate latitude and longitude rounded to ~100m, or a geohash like `gcpvj0`).
   - **Never stored publicly**:
     - User identities, personal friend names, phone IDs, private crew pin coordinates, or chat logs.
4. **Instant Adoption for Nearby Creators**:
   - When another group creator taps **Create a Group** while at or near the venue:
     - The browser checks the device's coarse GPS location (with user permission).
     - If public venues are active within 500m–2km, ChromaFloor displays:
       > 📍 **Venue found nearby: BangFace (Bang Room)**  
       > *3 rooms · Stage & 8 markers placed · 4 groups using this tonight*  
       > `[ Use This Floorplan ]` `[ Start From Blank ]`
   - One tap adopts the entire multi-room floorplan and stage geometry into their new private group session!

---

## 4. Static-Hosting Compatible Technical Architecture

ChromaFloor remains 100% statically hostable via **GitHub Pages** (zero servers to maintain or pay for). Group persistence, short codes, and discovery operate via a lightweight, serverless edge layer.

```mermaid
flowchart TD
  subgraph Client [Browser / PWA - GitHub Pages]
    A[Static App Shell: HTML/CSS/JS] --> B{URL Format}
    B -->|"?g=xyz" or "#cf1="| C[Direct Group Session]
    B -->|"Bare URL /"| D[Landing Page: Join Code or Create]
    C --> E[Offline PWA Service Worker]
  end

  subgraph Edge [Serverless Edge API - Cloudflare Workers or Supabase]
    F[POST /api/group/create]
    G[GET /api/group/:shortCode]
    H[POST /api/venue/publish]
    I[GET /api/venues/nearby?lat=&lng=]
  end

  subgraph Persistence [Storage Layer]
    J[(KV / D1 Database)]
    K[(PostGIS / Geohash Spatial Index)]
  end

  D -->|Enter "BANG-42"| G
  G --> J
  F --> J
  H --> K
  I --> K
```

### Proposed Stack Options:
1. **Cloudflare Workers + D1 / KV (Recommended for zero-cost edge scale)**:
   - **Workers**: Handles `/api/group` short-code resolution and `/api/venues/nearby`.
   - **KV / D1**: Stores `{ shortCode: "BANG-42", sessionId: "cf_...", expiresAt: timestamp }`.
   - **Geohash Prefix Indexing**: 6-character geohash (~1.2km precision) enables instant `O(1)` nearby venue queries without complex GIS extensions.
   - **Automatic TTL**: Cloudflare KV natively supports TTL expiration so venues and short codes automatically vanish after 30 days.
2. **Supabase (PostgreSQL + PostGIS)**:
   - Alternative standard relational approach using `ST_DWithin` on spatial coordinates.
   - Cron trigger (`pg_cron`) runs nightly: `DELETE FROM public_venues WHERE created_at < NOW() - INTERVAL '30 days';`.
3. **Decentralized / Peer-to-Peer Fallback (GunDB / WebRTC)**:
   - For environments with zero cellular signal (deep underground clubs, remote festival valleys), peer-to-peer WebRTC mesh sync via local QR code handshakes continues to function completely offline without any internet connection.
