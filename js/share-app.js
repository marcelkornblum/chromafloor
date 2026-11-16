/**
 * ChromaFloor - Simple Sharing UI Controller (index.html)
 * Streamlined crowd locator: room tabs, 2D colour wheel radar, draggable spot reticle,
 * real-time swatch card & full-screen beacon, and 1-click spot copy/share.
 */
(function() {
  'use strict';

  const ColorEngine = window.ChromaColorEngine;
  const UrlState = window.ChromaUrlState;
  const LiveSync = window.ChromaLiveSync;

  if (!ColorEngine || !UrlState) {
    console.error('[ChromaFloor] ChromaColorEngine and ChromaUrlState must be loaded before share-app.js');
    return;
  }

  // Storage Keys (Shared with setup-app.js)
  const STORAGE_KEY_EVENT = 'chromafloor_event_v3';
  const STORAGE_KEY_ROOMS = 'chromafloor_rooms_v3';
  const STORAGE_KEY_THEME = 'chromafloor_theme_v2';
  const STORAGE_KEY_SPOT = 'chromafloor_saved_spot_v3';
  const STORAGE_KEY_USERNAME = 'chromafloor_username_v3';
  const STORAGE_KEY_SESSION = 'chromafloor_session_v3';

  // Application State
  const state = {
    eventName: ColorEngine.DEFAULT_EVENT_NAME || 'BangFace',
    activeRoomId: 'main',
    rooms: JSON.parse(JSON.stringify(ColorEngine.DEFAULT_ROOMS)),
    spot: { x: 0.36, y: 0.34 },
    friendPin: null, // Friend pin decoded from URL if present
    friendBannerDismissed: false,
    flipped: false,
    beaconOpen: false,
    beaconPulsing: false,
    userName: '',
    sessionId: '',
    livePeers: [],
    liveStatus: { connectedCount: 0, state: 'offline' }
  };

  let liveClient = null;
  let shareFeedbackTimer = null;

  // Helper: Element getter by primary ID or fallback ID
  function getEl(primaryId, fallbackId) {
    return document.getElementById(primaryId) || (fallbackId ? document.getElementById(fallbackId) : null);
  }

  /**
   * Safe HTML escaper for user, friend, and room strings interpolated into innerHTML
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // DOM Elements
  const els = {
    btnVenueMenu: getEl('btn-venue-menu'),
    venueMenuModal: getEl('venue-menu-modal'),
    venueMenuTitle: getEl('venue-menu-title'),
    venueMenuRooms: getEl('venue-menu-rooms'),
    btnCloseVenueMenu: getEl('btn-close-venue-menu'),
    shareEventName: getEl('share-event-name', 'event-name-label'),
    linkToSetup: getEl('link-to-setup', 'btn-edit-layout'),
    roomTabs: getEl('room-tabs'),
    orientationHint: getEl('orientation-hint', 'orientation-label'),
    btnFlipWheel: getEl('btn-flip-wheel', 'btn-flip-view'),
    sharedFriendBanner: getEl('shared-friend-banner'),
    mapViewport: getEl('map-viewport'),
    floorCanvas: getEl('floor-canvas'),
    mapOverlay: getEl('map-overlay'),
    spotReadout: getEl('spot-readout'),
    swatchCard: getEl('swatch-card'), // legacy fallback if present
    swatchColorName: getEl('swatch-color-name'),
    swatchMeta: getEl('swatch-meta', 'swatch-position-meta'),
    btnFullscreenBeacon: getEl('btn-fullscreen-beacon', 'btn-flash-beacon'),
    btnShareSpot: getEl('btn-share-spot', 'btn-drop-share'),
    shareBtnLabel: getEl('share-btn-label'),
    beaconModal: getEl('beacon-modal'),
    beaconCloseBtn: getEl('beacon-close-btn'),
    beaconPulseBtn: getEl('beacon-pulse-btn'),
    beaconColorTitle: getEl('beacon-color-title'),
    beaconZoneCode: getEl('beacon-zone-code'),
    beaconRoomLabel: getEl('beacon-room-label'),
    beaconHexCode: getEl('beacon-hex-code'),
    toastContainer: getEl('toast-container'),
    metaThemeColor: document.querySelector('meta[name="theme-color"]'),
    liveBar: getEl('live-bar'),
    btnLiveToggle: getEl('btn-live-toggle'),
    liveDot: getEl('live-dot'),
    liveStatusText: getEl('live-status-text'),
    liveNameInput: getEl('live-name-input'),
    livePeersStrip: getEl('live-peers-strip'),
    btnShowQr: getEl('btn-show-qr'),
    beaconQrBtn: getEl('beacon-qr-btn'),
    qrModal: getEl('qr-modal'),
    qrModalTitle: getEl('qr-modal-title'),
    qrSvgWrap: getEl('qr-svg-wrap'),
    qrSpotSummary: getEl('qr-spot-summary'),
    qrLiveBadge: getEl('qr-live-badge'),
    qrLiveText: getEl('qr-live-text'),
    btnCloseQr: getEl('btn-close-qr'),
    btnQrCopy: getEl('btn-qr-copy'),
    btnQrDone: getEl('btn-qr-done')
  };

  /**
   * Safe toast notification
   */
  function showToast(message, duration = 3000) {
    let container = els.toastContainer || document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
      els.toastContainer = container;
    }
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  /**
   * Retreives active room object
   */
  function getActiveRoom() {
    return state.rooms.find(r => r.id === state.activeRoomId) || state.rooms[0] || ColorEngine.DEFAULT_ROOMS[0];
  }

  /**
   * Loads initial state from localStorage and URL hash (#cf1=)
   */
  function initData() {
    // 1. Load from localStorage
    try {
      const savedEvent = localStorage.getItem(STORAGE_KEY_EVENT);
      if (savedEvent) state.eventName = savedEvent;

      const savedRooms = localStorage.getItem(STORAGE_KEY_ROOMS);
      if (savedRooms) {
        const parsed = JSON.parse(savedRooms);
        if (Array.isArray(parsed) && parsed.length > 0) state.rooms = parsed;
      }

      const savedSpot = localStorage.getItem(STORAGE_KEY_SPOT);
      if (savedSpot) {
        const parsedSpot = JSON.parse(savedSpot);
        if (parsedSpot && typeof parsedSpot.x === 'number' && typeof parsedSpot.y === 'number') {
          state.spot = {
            x: Math.max(0, Math.min(1, parsedSpot.x)),
            y: Math.max(0, Math.min(1, parsedSpot.y))
          };
        }
      }

      const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
      if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
      }

      const savedUserName = localStorage.getItem(STORAGE_KEY_USERNAME);
      if (savedUserName) state.userName = savedUserName;

      const savedSession = sessionStorage.getItem(STORAGE_KEY_SESSION);
      if (savedSession) state.sessionId = savedSession;
    } catch (e) {
      console.warn('[share-app] LocalStorage read error:', e);
    }

    // 2. Decode URL hash if present
    const hash = window.location.hash;
    if (hash && hash.includes('#cf1=')) {
      const decoded = UrlState.decodeHash(hash);
      if (decoded) {
        if (decoded.eventName) state.eventName = decoded.eventName;
        if (Array.isArray(decoded.rooms) && decoded.rooms.length > 0) {
          state.rooms = decoded.rooms;
        }
        if (decoded.activeRoomId) {
          state.activeRoomId = decoded.activeRoomId;
        }
        if (decoded.sessionId) {
          state.sessionId = decoded.sessionId;
          try {
            sessionStorage.setItem(STORAGE_KEY_SESSION, decoded.sessionId);
          } catch (_) {}
        }

        // Check for friend pins or shared spot in hash
        const pins = Array.isArray(decoded.pins) ? decoded.pins : [];
        if (pins.length > 0) {
          // If focusPinId is provided, find it, otherwise take first pin
          const targetPin = pins.find(p => p.id === decoded.focusPinId) || pins[0];
          if (targetPin) {
            state.friendPin = targetPin;
            state.friendBannerDismissed = false;
            if (targetPin.roomId) state.activeRoomId = targetPin.roomId;
            // Initialize spot to friend's spot when opening link
            state.spot = { x: targetPin.x, y: targetPin.y };
          }
        } else {
          state.friendPin = null;
        }
      }
    }
  }

  /**
   * Returns clean user display name
   */
  function getUserDisplayName() {
    return (state.userName && state.userName.trim()) || 'Friend';
  }

  /**
   * Renders the Live Status Pill (#btn-live-toggle)
   */
  function renderLiveStatus() {
    if (!els.liveDot || !els.liveStatusText) return;

    if (!state.sessionId) {
      els.liveDot.className = 'live-dot';
      els.liveStatusText.textContent = 'Go Live';
      if (els.livePeersStrip) els.livePeersStrip.classList.add('hidden');
      return;
    }

    const { state: connState } = state.liveStatus;
    const peerCount = state.livePeers.length;

    if (connState === 'live') {
      els.liveDot.className = 'live-dot live';
      if (peerCount === 0) {
        els.liveStatusText.textContent = 'Live · Waiting for friend';
      } else {
        els.liveStatusText.textContent = `Live · ${peerCount + 1} on radar`;
      }
    } else if (connState === 'connecting') {
      els.liveDot.className = 'live-dot connecting';
      els.liveStatusText.textContent = 'Connecting…';
    } else {
      els.liveDot.className = 'live-dot';
      els.liveStatusText.textContent = 'Offline';
    }
  }

  /**
   * Renders horizontal live peers strip (#live-peers-strip)
   * Every friend chip is locked solidly to THEIR spot's exact colour.
   */
  function renderLivePeersStrip() {
    if (!els.livePeersStrip) return;

    if (!state.sessionId || state.livePeers.length === 0) {
      els.livePeersStrip.classList.add('hidden');
      els.livePeersStrip.innerHTML = '';
      return;
    }

    els.livePeersStrip.classList.remove('hidden');
    els.livePeersStrip.innerHTML = '';

    state.livePeers.forEach(peer => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'live-peer-chip';
      const peerName = peer.name || 'Friend';
      chip.title = `Switch to ${peerName}`;

      const peerRoom = state.rooms.find(r => r.id === peer.roomId) || getActiveRoom();
      const peerColor = ColorEngine.getSpotColor(peer.x, peer.y, peerRoom.palette || 'wheel');
      const chipHex = peer.hex || peerColor.hex;
      const chipText = peerColor.textColor;
      const chipColorName = peer.colorName || peerColor.colorName;

      // Solidly lock pill to friend's exact spot colour (never washed into dynamic theme)
      chip.style.setProperty('background', chipHex, 'important');
      chip.style.setProperty('background-color', chipHex, 'important');
      chip.style.setProperty('color', chipText, 'important');
      chip.style.borderColor = chipText === '#FFFFFF' ? '#FFFFFF' : '#0B0E14';

      const isDiffRoom = Boolean(peer.roomId && peer.roomId !== state.activeRoomId);
      const roomHint = isDiffRoom ? ` ↗ ${escapeHtml(peerRoom.name)}` : '';

      // Distance calculation in meters when in same room
      let distText = '';
      if (!isDiffRoom) {
        try {
          const directions = ColorEngine.getWalkingDirections(state.spot, peer, peerRoom);
          if (directions && typeof directions.meters === 'number') {
            distText = ` · ${directions.meters}m`;
          }
        } catch (_) {}
      }

      chip.innerHTML = `
        <span class="live-peer-chip-dot" style="background-color: ${chipText}; border-color: ${chipText};"></span>
        <span style="color: inherit;"><strong>${escapeHtml(peerName)}</strong> · ${escapeHtml(chipColorName)}</span>
        ${(roomHint || distText) ? `<span class="live-peer-chip-dist" style="color: inherit; opacity: 0.9;">${roomHint}${escapeHtml(distText)}</span>` : ''}
      `;

      chip.addEventListener('click', () => {
        if (peer.roomId && peer.roomId !== state.activeRoomId) {
          state.activeRoomId = peer.roomId;
          renderRoomTabs();
          updateOrientationHint();
          renderFloorCanvas();
          renderOverlay();
          updateSwatch();
          updateHeader();
          renderLivePeersStrip();
          publishCurrentSpot();
        } else {
          // Snap spot to peer if in same room
          state.spot = { x: peer.x, y: peer.y };
          renderOverlay();
          updateSwatch();
          renderLivePeersStrip();
          publishCurrentSpot();
          showToast(`📍 Snapped to ${peerName}'s spot!`);
        }
      });

      els.livePeersStrip.appendChild(chip);
    });
  }

  /**
   * Publishes user's current live spot
   */
  function publishCurrentSpot() {
    if (!liveClient || !state.sessionId) return;
    const room = getActiveRoom();
    const palette = room.palette || 'wheel';
    const spotColor = ColorEngine.getSpotColor(state.spot.x, state.spot.y, palette);

    liveClient.publishSpot({
      name: getUserDisplayName(),
      roomId: state.activeRoomId,
      x: state.spot.x,
      y: state.spot.y,
      hex: spotColor.hex,
      colorName: spotColor.colorName,
      zoneCode: spotColor.zoneCode
    });
  }

  /**
   * Starts or updates Live Finder client
   */
  function ensureLiveClient() {
    if (!LiveSync || !state.sessionId) return;

    if (!liveClient) {
      liveClient = LiveSync.createClient({
        sessionId: state.sessionId,
        onPeersChange: (peers) => {
          state.livePeers = peers || [];
          renderLiveStatus();
          renderLivePeersStrip();
          renderOverlay();
          updateQrLiveStatusText();
          if (els.venueMenuModal && !els.venueMenuModal.classList.contains('hidden')) {
            renderVenueMenu();
          }
        },
        onStatusChange: (status) => {
          state.liveStatus = status || { connectedCount: 0, state: 'offline' };
          renderLiveStatus();
          updateQrLiveStatusText();
        }
      });
      liveClient.start();
    } else {
      liveClient.setSession(state.sessionId);
    }

    renderLiveStatus();
    publishCurrentSpot();
  }

  /**
   * Builds Venue Setup URL preserving full current state
   */
  function getSetupUrl() {
    return UrlState.buildSetupUrl({
      eventName: state.eventName,
      activeRoomId: state.activeRoomId,
      rooms: state.rooms,
      pins: state.friendPin ? [state.friendPin] : [],
      sessionId: state.sessionId
    });
  }

  /**
   * Synchronize UI header & link to setup
   */
  function updateHeader() {
    if (els.shareEventName) {
      els.shareEventName.textContent = state.eventName || 'BangFace';
    }
    if (els.venueMenuTitle) {
      els.venueMenuTitle.textContent = state.eventName || 'BangFace';
    }

    // Update link-to-setup href preserving full current state
    if (els.linkToSetup) {
      const setupUrl = getSetupUrl();
      if (els.linkToSetup.tagName.toLowerCase() === 'a') {
        els.linkToSetup.href = setupUrl;
      } else {
        els.linkToSetup.onclick = () => { window.location.href = setupUrl; };
      }
    }
  }

  /**
   * Full-Screen Room-Divided Venue Menu (#venue-menu-modal)
   */
  function renderVenueMenu() {
    if (els.venueMenuTitle) {
      els.venueMenuTitle.textContent = state.eventName || 'BangFace';
    }
    if (!els.venueMenuRooms) return;
    els.venueMenuRooms.innerHTML = '';

    const activeFriends = state.livePeers.length > 0
      ? state.livePeers
      : (state.friendPin ? [state.friendPin] : []);

    state.rooms.forEach(room => {
      const isActive = room.id === state.activeRoomId;
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = `venue-room-tile${isActive ? ' active' : ''}`;

      const friendsInRoom = activeFriends.filter(f => (f.roomId || 'main') === room.id);
      const friendPillsHtml = friendsInRoom.map(f => {
        const fc = ColorEngine.getSpotColor(f.x, f.y, room.palette || 'wheel');
        const fName = (f.name && f.name !== 'Shared Spot') ? f.name : 'Friend';
        return `<span class="venue-room-friend-pill" style="background-color: ${fc.hex}; color: ${fc.textColor};">${escapeHtml(fName)} · <span style="text-transform:uppercase; letter-spacing:0.03em;">${escapeHtml(fc.colorName)}</span></span>`;
      }).join('');

      const lmCount = Array.isArray(room.landmarks) ? room.landmarks.length : 0;

      tile.innerHTML = `
        <div class="venue-room-tile-eyebrow">${isActive ? '● CURRENT ROOM' : 'TAP TO ENTER'}</div>
        <div class="venue-room-tile-name">${escapeHtml(room.name || 'Room')}</div>
        <div class="venue-room-tile-meta">
          <span>${lmCount} markers</span>
          ${friendPillsHtml}
        </div>
      `;

      tile.addEventListener('click', () => {
        state.activeRoomId = room.id;
        closeVenueMenu();
        renderRoomTabs();
        updateOrientationHint();
        renderFloorCanvas();
        renderOverlay();
        updateSwatch();
        updateHeader();
        if (state.livePeers.length > 0) renderLivePeersStrip();
        publishCurrentSpot();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      els.venueMenuRooms.appendChild(tile);
    });

    // Bottom split row: Home & Venue Setup
    const setupUrl = getSetupUrl();
    const homeRow = document.createElement('div');
    homeRow.className = 'venue-home-row';
    homeRow.innerHTML = `
      <button type="button" id="btn-menu-home" class="venue-room-tile venue-home-tile">
        <div class="venue-room-tile-eyebrow">RADAR</div>
        <div class="venue-room-tile-name">🏠 Home</div>
        <div class="venue-room-tile-meta"><span>Back to Radar</span></div>
      </button>
      <a id="link-menu-setup" href="${escapeHtml(setupUrl)}" class="venue-room-tile venue-home-tile" style="text-decoration: none;">
        <div class="venue-room-tile-eyebrow">CUSTOMIZE</div>
        <div class="venue-room-tile-name">⚙️ Venue Setup</div>
        <div class="venue-room-tile-meta"><span>Edit stages &amp; rooms</span></div>
      </a>
    `;

    const btnMenuHome = homeRow.querySelector('#btn-menu-home');
    if (btnMenuHome) {
      btnMenuHome.addEventListener('click', () => {
        closeVenueMenu();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    els.venueMenuRooms.appendChild(homeRow);
  }

  function openVenueMenu() {
    if (!els.venueMenuModal) return;
    if (els.btnVenueMenu) {
      els.btnVenueMenu.setAttribute('aria-expanded', 'true');
    }
    renderVenueMenu();
    els.venueMenuModal.classList.remove('hidden');
  }

  function closeVenueMenu() {
    if (els.venueMenuModal) {
      els.venueMenuModal.classList.add('hidden');
    }
    if (els.btnVenueMenu) {
      els.btnVenueMenu.setAttribute('aria-expanded', 'false');
    }
  }

  function setupVenueMenu() {
    if (els.btnVenueMenu) {
      els.btnVenueMenu.addEventListener('click', () => {
        if (els.venueMenuModal && !els.venueMenuModal.classList.contains('hidden')) {
          closeVenueMenu();
        } else {
          openVenueMenu();
        }
      });
    }

    if (els.btnCloseVenueMenu) {
      els.btnCloseVenueMenu.addEventListener('click', closeVenueMenu);
    }

    if (els.venueMenuModal) {
      els.venueMenuModal.addEventListener('click', (e) => {
        if (e.target === els.venueMenuModal) {
          closeVenueMenu();
        }
      });
    }
  }

  /**
   * Renders room selection tabs
   */
  function renderRoomTabs() {
    if (!els.roomTabs) return;
    els.roomTabs.innerHTML = '';

    state.rooms.forEach(room => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `room-tab ${room.id === state.activeRoomId ? 'active' : ''}`;
      tab.textContent = room.name;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', room.id === state.activeRoomId ? 'true' : 'false');
      tab.addEventListener('click', () => {
        state.activeRoomId = room.id;
        renderRoomTabs();
        updateOrientationHint();
        renderFloorCanvas();
        renderOverlay();
        updateSwatch();
        updateHeader();
        if (state.livePeers.length > 0) renderLivePeersStrip();
        publishCurrentSpot();
      });
      els.roomTabs.appendChild(tab);
    });
  }

  /**
   * Orientation hint text
   */
  function updateOrientationHint() {
    if (!els.orientationHint) return;
    const room = getActiveRoom();
    const stage = ColorEngine.getStageOrigin(room);
    if (stage.hasStage) {
      els.orientationHint.textContent = state.flipped
        ? `FACING AWAY FROM ${stage.name.toUpperCase()} ↓`
        : `FACING ${stage.name.toUpperCase()} ↑`;
    } else {
      els.orientationHint.textContent = state.flipped ? 'STAGE BEHIND YOU ↓' : 'FACING FRONT / STAGE ↑';
    }
  }

  /**
   * Renders high-DPI floor canvas with chosen palette and subtle depth rings
   */
  function renderFloorCanvas() {
    if (!els.floorCanvas || !els.mapViewport) return;
    const room = getActiveRoom();
    const palette = room.palette || 'wheel';

    const rect = els.mapViewport.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.round(rect.width) || 360;
    const displayHeight = Math.round(rect.height) || displayWidth;

    els.floorCanvas.width = displayWidth * dpr;
    els.floorCanvas.height = displayHeight * dpr;

    const ctx = els.floorCanvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Generate gradient floor background
    const bg = ColorEngine.createFloorBackground(displayWidth, displayHeight, state.flipped, room.shape, palette);
    ctx.drawImage(bg, 0, 0, displayWidth, displayHeight);

    // Draw subtle polar depth rings and guide lines
    ColorEngine.drawWheelGuides(ctx, displayWidth, displayHeight, {
      showGrid: true,
      palette
    });
  }

  /**
   * Applies Dynamic Whole-App Colour Theming onto document.body (.themed-share-body)
   */
  function applyWholeAppTheme(spotColor) {
    if (!document.body || !document.body.classList.contains('themed-share-body')) return;

    const { h, s, l, rgb, hex, textColor } = spotColor;
    const [r, g, b] = rgb;
    const isLight = textColor === '#0E1012';

    // Compute dimensional atmospheric edge stop from (h, s, l)
    const edgeSat = Math.min(100, s + 4);
    const edgeLum = Math.max(10, Math.round(l * 0.72));
    const edgeRgb = ColorEngine.hslToRgb(h, edgeSat, edgeLum);
    const edgeColor = `rgb(${edgeRgb[0]}, ${edgeRgb[1]}, ${edgeRgb[2]})`;

    const bodyStyle = document.body.style;
    bodyStyle.setProperty('--spot-hex', hex);
    bodyStyle.setProperty('--spot-rgb', `${r}, ${g}, ${b}`);
    bodyStyle.setProperty('--spot-bg-edge', edgeColor);

    if (isLight) {
      bodyStyle.setProperty('--theme-fg', '#0B0E14');
      bodyStyle.setProperty('--theme-fg-muted', 'rgba(11, 14, 20, 0.72)');
      bodyStyle.setProperty('--theme-glass', 'rgba(11, 14, 20, 0.09)');
      bodyStyle.setProperty('--theme-glass-hover', 'rgba(11, 14, 20, 0.16)');
      bodyStyle.setProperty('--theme-glass-border', 'rgba(11, 14, 20, 0.18)');
      bodyStyle.setProperty('--theme-wheel-bar', 'rgba(11, 14, 20, 0.09)');
      bodyStyle.setProperty('--theme-solid-bg', '#0B0E14');
      bodyStyle.setProperty('--theme-solid-fg', '#FFFFFF');
    } else {
      bodyStyle.setProperty('--theme-fg', '#FFFFFF');
      bodyStyle.setProperty('--theme-fg-muted', 'rgba(255, 255, 255, 0.78)');
      bodyStyle.setProperty('--theme-glass', 'rgba(255, 255, 255, 0.14)');
      bodyStyle.setProperty('--theme-glass-hover', 'rgba(255, 255, 255, 0.22)');
      bodyStyle.setProperty('--theme-glass-border', 'rgba(255, 255, 255, 0.26)');
      bodyStyle.setProperty('--theme-wheel-bar', 'rgba(255, 255, 255, 0.14)');
      bodyStyle.setProperty('--theme-solid-bg', '#FFFFFF');
      bodyStyle.setProperty('--theme-solid-fg', '#0B0E14');
    }

    // Sync mobile browser status bar tint in real time
    if (!els.metaThemeColor) {
      els.metaThemeColor = document.querySelector('meta[name="theme-color"]');
    }
    if (els.metaThemeColor) {
      els.metaThemeColor.setAttribute('content', hex);
    }
  }

  /**
   * Updates spot readout, dynamic app theme, and full-screen beacon info
   */
  function updateSwatch() {
    const room = getActiveRoom();
    const palette = room.palette || 'wheel';
    const spotColor = ColorEngine.getSpotColor(state.spot.x, state.spot.y, palette);
    const nearest = ColorEngine.getNearestLandmark(state.spot.x, state.spot.y, room);

    // Dynamic whole-app theme sync
    applyWholeAppTheme(spotColor);

    // Update Swatch / Spot Readout Text
    if (els.swatchColorName) {
      els.swatchColorName.textContent = spotColor.colorName;
    }

    const posHint = nearest.phrase || spotColor.fullPositionLabel;
    const metaParts = [`Zone ${spotColor.zoneCode}`, spotColor.hex, posHint];

    if (els.swatchMeta) {
      els.swatchMeta.textContent = metaParts.join(' · ');
    }

    if (els.swatchCard) {
      els.swatchCard.style.backgroundColor = spotColor.hex;
      els.swatchCard.style.color = spotColor.textColor;
      els.swatchCard.style.borderColor = spotColor.textColor === '#FFFFFF' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';
    }

    // Save user spot to localStorage
    try {
      localStorage.setItem(STORAGE_KEY_SPOT, JSON.stringify(state.spot));
    } catch (_) {}

    // Update Full-screen Beacon if open
    if (els.beaconModal && !els.beaconModal.classList.contains('hidden')) {
      els.beaconModal.style.backgroundColor = spotColor.hex;
      els.beaconModal.style.color = spotColor.textColor;
      if (els.beaconColorTitle) els.beaconColorTitle.textContent = spotColor.colorName;
      if (els.beaconZoneCode) els.beaconZoneCode.textContent = spotColor.zoneCode;
      if (els.beaconRoomLabel) els.beaconRoomLabel.textContent = `${room.name}${nearest.phrase ? ` · ${nearest.phrase}` : ''}`;
      if (els.beaconHexCode) els.beaconHexCode.textContent = spotColor.hex;
    }

    return spotColor;
  }

  /**
   * Computes edge-safe horizontal/vertical shift style so map pin labels never clip off canvas edges
   */
  function getPinLabelShiftStyle(dispX, dispY) {
    let shiftPct = 0;
    if (dispX < 0.24) {
      shiftPct = Math.round(((0.24 - dispX) / 0.24) * 44);
    } else if (dispX > 0.76) {
      shiftPct = -Math.round(((dispX - 0.76) / 0.24) * 44);
    }
    const transformPart = shiftPct !== 0 ? ` transform: translateX(${shiftPct}%);` : '';
    const verticalPart = dispY > 0.90 ? ' order: -1; margin-top: 0; margin-bottom: 4px;' : '';
    return `${transformPart}${verticalPart}`;
  }

  /**
   * Renders the interactive map overlay:
   * - Placed landmark pills (Stage, Bar, DJ, etc.)
   * - Draggable user reticle marker with live floating label
   * - Solid friend-colour banner & high-impact colour-drenched friend/peer badges on the wheel
   */
  function renderOverlay() {
    if (!els.mapOverlay) return;
    els.mapOverlay.innerHTML = '';

    const room = getActiveRoom();
    const palette = room.palette || 'wheel';
    const spotColor = ColorEngine.getSpotColor(state.spot.x, state.spot.y, palette);
    const hasLivePeers = state.livePeers.length > 0;

    // 1a. Static Shared Friend Banner (#shared-friend-banner) — always solidly locked to THEIR spot's exact colour
    if (!hasLivePeers && state.friendPin && !state.friendBannerDismissed) {
      if (els.sharedFriendBanner) {
        const friendRoom = state.rooms.find(r => r.id === state.friendPin.roomId) || room;
        const friendSpotColor = ColorEngine.getSpotColor(
          state.friendPin.x,
          state.friendPin.y,
          friendRoom.palette || 'wheel'
        );

        els.sharedFriendBanner.classList.remove('hidden');
        els.sharedFriendBanner.style.setProperty('background', friendSpotColor.hex, 'important');
        els.sharedFriendBanner.style.setProperty('background-color', friendSpotColor.hex, 'important');
        els.sharedFriendBanner.style.setProperty('color', friendSpotColor.textColor, 'important');
        els.sharedFriendBanner.style.borderColor = friendSpotColor.textColor === '#FFFFFF' ? '#FFFFFF' : '#0B0E14';

        const rawName = (state.friendPin.name && state.friendPin.name !== 'Shared Spot')
          ? state.friendPin.name
          : 'Friend';
        const friendNearest = ColorEngine.getNearestLandmark(state.friendPin.x, state.friendPin.y, friendRoom);
        const nearText = friendNearest.phrase ? ` · ${escapeHtml(friendNearest.phrase)}` : '';
        const isDiffRoom = Boolean(state.friendPin.roomId && state.friendPin.roomId !== state.activeRoomId);
        const locationSuffix = isDiffRoom ? ` ↗ ${escapeHtml(friendRoom.name)}` : nearText;

        els.sharedFriendBanner.innerHTML = `
          <div class="friend-banner-content" role="button" tabindex="0" style="color: inherit; cursor: pointer;">
            <span class="friend-dot" style="background-color: ${friendSpotColor.textColor}; border-color: ${friendSpotColor.textColor};"></span>
            <span style="color: inherit;"><strong>${escapeHtml(rawName)}</strong>: <strong>${escapeHtml(friendSpotColor.colorName)}</strong>${locationSuffix}</span>
          </div>
          <button type="button" class="friend-banner-close" aria-label="Dismiss banner" style="color: inherit;">✕</button>
        `;

        const bannerContent = els.sharedFriendBanner.querySelector('.friend-banner-content');
        if (bannerContent) {
          const handleBannerActivate = () => {
            if (state.friendPin.roomId && state.friendPin.roomId !== state.activeRoomId) {
              state.activeRoomId = state.friendPin.roomId;
              renderRoomTabs();
              updateOrientationHint();
              renderFloorCanvas();
              renderOverlay();
              updateSwatch();
              updateHeader();
              publishCurrentSpot();
              showToast(`Switched to ${friendRoom.name}`);
            } else {
              state.spot = { x: state.friendPin.x, y: state.friendPin.y };
              renderOverlay();
              updateSwatch();
              publishCurrentSpot();
              showToast(`Snapped to ${rawName}'s spot!`);
            }
          };
          bannerContent.addEventListener('click', handleBannerActivate);
          bannerContent.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleBannerActivate();
            }
          });
        }

        const closeBtn = els.sharedFriendBanner.querySelector('.friend-banner-close');
        if (closeBtn) {
          closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            state.friendBannerDismissed = true;
            els.sharedFriendBanner.classList.add('hidden');
          });
        }
      }
    } else if (els.sharedFriendBanner) {
      els.sharedFriendBanner.classList.add('hidden');
    }

    // 1b. Static Friend Pin on Floor (when friend is in active room and 0 live peers)
    if (!hasLivePeers && state.friendPin && (!state.friendPin.roomId || state.friendPin.roomId === state.activeRoomId)) {
      const friendSpotColor = ColorEngine.getSpotColor(state.friendPin.x, state.friendPin.y, palette);
      const friendLabelName = (state.friendPin.name && state.friendPin.name !== 'Shared Spot')
        ? state.friendPin.name
        : 'Friend';

      const friendX = state.flipped ? (1 - state.friendPin.x) : state.friendPin.x;
      const friendY = state.flipped ? (1 - state.friendPin.y) : state.friendPin.y;
      const shiftStyle = getPinLabelShiftStyle(friendX, friendY);

      const friendPinEl = document.createElement('div');
      friendPinEl.className = 'friend-pin-marker';
      friendPinEl.style.left = `${friendX * 100}%`;
      friendPinEl.style.top = `${friendY * 100}%`;
      friendPinEl.innerHTML = `
        <div class="friend-pin-pulse" style="border: 3px solid ${friendSpotColor.hex}; box-shadow: 0 0 12px ${friendSpotColor.hex};"></div>
        <div class="friend-pin-dot" style="background-color: ${friendSpotColor.hex}; border: 2.5px solid #FFFFFF;"></div>
        <div class="friend-pin-label" style="background-color: ${friendSpotColor.hex}; color: ${friendSpotColor.textColor}; border: 2.5px solid #FFFFFF;${shiftStyle}"><span>${escapeHtml(friendLabelName)} · <span style="text-transform:uppercase; letter-spacing:0.03em;">${escapeHtml(friendSpotColor.colorName)}</span></span></div>
      `;
      friendPinEl.addEventListener('click', (e) => {
        e.stopPropagation();
        state.spot = { x: state.friendPin.x, y: state.friendPin.y };
        renderOverlay();
        updateSwatch();
        publishCurrentSpot();
        showToast(`Snapped to ${friendLabelName}'s spot!`);
      });
      els.mapOverlay.appendChild(friendPinEl);
    }

    // 1c. Live Peer Pins in Active Room — drenched solidly in each friend's exact spot colour
    state.livePeers.forEach(peer => {
      if (peer.roomId !== state.activeRoomId) return;

      const px = state.flipped ? (1 - peer.x) : peer.x;
      const py = state.flipped ? (1 - peer.y) : peer.y;
      const peerSpotColor = ColorEngine.getSpotColor(peer.x, peer.y, palette);
      const pinHex = peer.hex || peerSpotColor.hex;
      const pinText = peerSpotColor.textColor;
      const pinColorName = peer.colorName || peerSpotColor.colorName;
      const peerShiftStyle = getPinLabelShiftStyle(px, py);

      const peerPinEl = document.createElement('div');
      peerPinEl.className = 'live-peer-pin';
      peerPinEl.style.left = `${px * 100}%`;
      peerPinEl.style.top = `${py * 100}%`;

      // Walking distance calculation
      let distTag = '';
      try {
        const directions = ColorEngine.getWalkingDirections(state.spot, peer, room);
        if (directions && typeof directions.meters === 'number') {
          distTag = `${directions.meters}m`;
        }
      } catch (_) {}

      const metaInfo = peer.isLive
        ? distTag
        : (peer.ts ? `${Math.max(1, Math.round((Date.now() - peer.ts) / 60000))}m ago` : distTag);
      const distSuffix = metaInfo ? ` · ${escapeHtml(metaInfo)}` : '';
      const peerLabelName = peer.name || 'Friend';

      peerPinEl.innerHTML = `
        ${peer.isLive !== false ? `<div class="live-peer-halo" style="border: 3px solid ${pinHex}; box-shadow: 0 0 12px ${pinHex};"></div>` : ''}
        <div class="live-peer-circle" style="background-color: ${pinHex}; border: 2.5px solid #FFFFFF;"></div>
        <div class="live-peer-tag" style="background-color: ${pinHex}; color: ${pinText}; border: 2.5px solid #FFFFFF;${peerShiftStyle}"><span>${escapeHtml(peerLabelName)} · <span style="text-transform:uppercase; letter-spacing:0.03em;">${escapeHtml(pinColorName)}</span>${distSuffix}</span></div>
      `;

      peerPinEl.addEventListener('click', (e) => {
        e.stopPropagation();
        state.spot = { x: peer.x, y: peer.y };
        renderOverlay();
        updateSwatch();
        renderLivePeersStrip();
        publishCurrentSpot();
        showToast(`📍 Snapped to ${peerLabelName}'s spot!`);
      });

      els.mapOverlay.appendChild(peerPinEl);
    });

    // 2. Render Placed Landmarks
    const landmarks = Array.isArray(room.landmarks) ? room.landmarks : [];
    landmarks.forEach(lm => {
      const rawDispX = state.flipped ? (1 - lm.x) : lm.x;
      const rawDispY = state.flipped ? (1 - lm.y) : lm.y;
      const isStage = (lm.type === 'stage');
      const dispX = isStage
        ? Math.max(0.18, Math.min(0.82, rawDispX))
        : Math.max(0.085, Math.min(0.915, rawDispX));
      const dispY = isStage
        ? Math.max(0.08, Math.min(0.92, rawDispY))
        : Math.max(0.085, Math.min(0.915, rawDispY));

      const pill = document.createElement('div');
      const hasLabel = Boolean(lm.name && lm.name.trim().length > 0);
      const isPureEmoji = !isStage && !hasLabel;
      pill.className = `landmark-pill landmark-${lm.type || 'custom'}${isPureEmoji ? ' pure-emoji' : ''}`;
      pill.style.left = `${dispX * 100}%`;
      pill.style.top = `${dispY * 100}%`;
      pill.dataset.type = lm.type || 'custom';

      const emojiHtml = `<span class="lm-emoji${isPureEmoji ? ' standalone' : ''}">${escapeHtml(lm.icon || '📍')}</span>`;
      const labelHtml = (isStage || hasLabel) ? `<span class="lm-text">${escapeHtml(lm.name || (isStage ? 'STAGE' : ''))}</span>` : '';
      pill.innerHTML = `${emojiHtml}${labelHtml}`;

      // Tapping a landmark gently snaps reticle to it!
      pill.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        state.spot = { x: lm.x, y: lm.y };
        renderOverlay();
        updateSwatch();
        if (state.livePeers.length > 0) renderLivePeersStrip();
        publishCurrentSpot();
        const toastName = (lm.name && lm.name.trim()) ? lm.name.trim() : (lm.icon || 'marker');
        showToast(`Snapped to ${toastName}`);
      });
      els.mapOverlay.appendChild(pill);
    });

    // 3. Render Draggable Reticle Marker
    const renderX = state.flipped ? (1 - state.spot.x) : state.spot.x;
    const renderY = state.flipped ? (1 - state.spot.y) : state.spot.y;

    const reticle = document.createElement('div');
    reticle.id = 'user-reticle-marker';
    reticle.className = 'reticle-marker';
    reticle.style.left = `${renderX * 100}%`;
    reticle.style.top = `${renderY * 100}%`;

    const ring = document.createElement('div');
    ring.className = 'reticle-ring';
    reticle.appendChild(ring);

    const dot = document.createElement('div');
    dot.className = 'reticle-dot';
    reticle.appendChild(dot);

    const label = document.createElement('div');
    label.className = 'reticle-label';
    label.textContent = `${spotColor.colorName} · ${spotColor.zoneCode}`;
    reticle.appendChild(label);

    els.mapOverlay.appendChild(reticle);
  }

  /**
   * Sets up 60fps pointer drag on floor canvas
   */
  function setupMapInteractions() {
    if (!els.mapViewport) return;

    let isDragging = false;

    function handlePointer(e) {
      const rect = els.mapViewport.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const clientX = e.clientX;
      const clientY = e.clientY;

      let normX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      let normY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

      if (state.flipped) {
        normX = 1 - normX;
        normY = 1 - normY;
      }

      state.spot = { x: normX, y: normY };

      // Update reticle position directly for silky 60fps
      const reticle = document.getElementById('user-reticle-marker');
      const room = getActiveRoom();
      const palette = room.palette || 'wheel';
      const spotColor = ColorEngine.getSpotColor(state.spot.x, state.spot.y, palette);

      const renderX = state.flipped ? (1 - state.spot.x) : state.spot.x;
      const renderY = state.flipped ? (1 - state.spot.y) : state.spot.y;

      if (reticle) {
        reticle.style.left = `${renderX * 100}%`;
        reticle.style.top = `${renderY * 100}%`;
        const label = reticle.querySelector('.reticle-label');
        if (label) label.textContent = `${spotColor.colorName} · ${spotColor.zoneCode}`;
      }

      updateSwatch();
      publishCurrentSpot();
    }

    els.mapViewport.addEventListener('pointerdown', (e) => {
      // Don't intercept button clicks
      if (e.target.closest('button')) return;
      isDragging = true;
      try {
        els.mapViewport.setPointerCapture(e.pointerId);
      } catch (_) {}
      handlePointer(e);
    });

    els.mapViewport.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      handlePointer(e);
    });

    function endDrag(e) {
      if (!isDragging) return;
      isDragging = false;
      try {
        els.mapViewport.releasePointerCapture(e.pointerId);
      } catch (_) {}
      renderOverlay();
      updateSwatch();
      if (state.livePeers.length > 0) renderLivePeersStrip();
      publishCurrentSpot();
    }

    els.mapViewport.addEventListener('pointerup', endDrag);
    els.mapViewport.addEventListener('pointercancel', endDrag);

    // Keyboard navigation (Arrow keys move spot 1%)
    els.mapViewport.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.05 : 0.01;
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') dx = state.flipped ? step : -step;
      else if (e.key === 'ArrowRight') dx = state.flipped ? -step : step;
      else if (e.key === 'ArrowUp') dy = state.flipped ? step : -step;
      else if (e.key === 'ArrowDown') dy = state.flipped ? -step : step;
      else return;

      e.preventDefault();
      state.spot.x = Math.max(0, Math.min(1, state.spot.x + dx));
      state.spot.y = Math.max(0, Math.min(1, state.spot.y + dy));
      renderOverlay();
      updateSwatch();
      if (state.livePeers.length > 0) renderLivePeersStrip();
      publishCurrentSpot();
    });
  }

  /**
   * One-Click Share / Copy Action
   */
  async function handleOneClickShare() {
    const room = getActiveRoom();
    const palette = room.palette || 'wheel';
    const spotColor = ColorEngine.getSpotColor(state.spot.x, state.spot.y, palette);
    const nearest = ColorEngine.getNearestLandmark(state.spot.x, state.spot.y, room);

    // If sessionId not present, generate one and activate Live Finder
    if (!state.sessionId && LiveSync) {
      state.sessionId = LiveSync.generateSessionId();
      try {
        sessionStorage.setItem(STORAGE_KEY_SESSION, state.sessionId);
      } catch (_) {}
      ensureLiveClient();
    } else {
      ensureLiveClient();
    }

    // Build URL hash with spot & sessionId
    const shareStateObj = {
      eventName: state.eventName,
      activeRoomId: state.activeRoomId,
      focusPinId: 'spot',
      pins: [
        {
          id: 'spot',
          name: getUserDisplayName(),
          roomId: state.activeRoomId,
          x: state.spot.x,
          y: state.spot.y,
          ts: Date.now(),
          colorName: spotColor.colorName
        }
      ],
      rooms: state.rooms,
      sessionId: state.sessionId
    };

    const shareUrl = UrlState.buildShareUrl(shareStateObj);
    const hash = UrlState.encodeState(shareStateObj);

    // Update browser history URL hash seamlessly
    window.history.replaceState(null, '', hash);
    updateHeader();

    const fullMessage = UrlState.buildSimpleSpotMessage({
      spotColor,
      room,
      eventName: state.eventName,
      nearestPhrase: nearest.phrase,
      shareUrl
    });

    // 1. Copy to clipboard
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(fullMessage);
        copied = true;
      }
    } catch (e) {
      console.warn('[share-app] Clipboard write error:', e);
    }

    // 2. Try native navigator.share if on mobile / touch device
    const canNativeShare = Boolean(
      navigator.share &&
      (navigator.maxTouchPoints > 0 || /mobile|android|iphone/i.test(navigator.userAgent))
    );

    if (canNativeShare) {
      try {
        await navigator.share({
          title: `ChromaFloor — ${spotColor.colorName}`,
          text: fullMessage,
          url: shareUrl
        });
      } catch (err) {
        // AbortError is expected when user cancels share sheet
        if (err.name !== 'AbortError') {
          console.warn('[share-app] Native share error:', err);
        }
      }
    }

    // 3. Crisp Share button feedback ('✓ Copied!', restoring to 'Share' after 2.5s)
    if (shareFeedbackTimer) {
      clearTimeout(shareFeedbackTimer);
      shareFeedbackTimer = null;
    }
    if (els.shareBtnLabel) {
      els.shareBtnLabel.textContent = '✓ Copied!';
      shareFeedbackTimer = setTimeout(() => {
        if (els.shareBtnLabel) els.shareBtnLabel.textContent = 'Share';
        shareFeedbackTimer = null;
      }, 2500);
    } else if (els.btnShareSpot) {
      els.btnShareSpot.textContent = '✓ Copied!';
      shareFeedbackTimer = setTimeout(() => {
        if (els.btnShareSpot) els.btnShareSpot.textContent = 'Share';
        shareFeedbackTimer = null;
      }, 2500);
    }

    showToast(copied ? '✓ Copied spot & radar link to clipboard!' : '✓ Spot link ready!');
  }

  /**
   * Beacon Modal Setup
   */
  function setupBeacon() {
    if (!els.btnFullscreenBeacon || !els.beaconModal) return;

    els.btnFullscreenBeacon.addEventListener('click', () => {
      state.beaconOpen = true;
      els.beaconModal.classList.remove('hidden');
      updateSwatch();
    });

    if (els.beaconCloseBtn) {
      els.beaconCloseBtn.addEventListener('click', () => {
        state.beaconOpen = false;
        state.beaconPulsing = false;
        els.beaconModal.classList.add('hidden');
        els.beaconModal.classList.remove('pulsing');
        if (els.beaconPulseBtn) els.beaconPulseBtn.textContent = 'Pulse: OFF';
      });
    }

    if (els.beaconPulseBtn) {
      els.beaconPulseBtn.addEventListener('click', () => {
        state.beaconPulsing = !state.beaconPulsing;
        if (state.beaconPulsing) {
          els.beaconModal.classList.add('pulsing');
          els.beaconPulseBtn.textContent = 'Pulse: ON';
        } else {
          els.beaconModal.classList.remove('pulsing');
          els.beaconPulseBtn.textContent = 'Pulse: OFF';
        }
      });
    }

    if (els.beaconQrBtn) {
      els.beaconQrBtn.addEventListener('click', () => {
        openQrModal();
      });
    }
  }

  /**
   * Global Escape key handler for Venue Menu, QR Modal, and Beacon Modal
   */
  function setupGlobalKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (els.venueMenuModal && !els.venueMenuModal.classList.contains('hidden')) {
          closeVenueMenu();
        } else if (els.qrModal && !els.qrModal.classList.contains('hidden')) {
          closeQrModal();
        } else if (state.beaconOpen) {
          if (els.beaconCloseBtn) els.beaconCloseBtn.click();
        }
      }
    });
  }

  let activeShareUrl = '';

  function updateQrLiveStatusText() {
    if (!els.qrLiveText || !els.qrModal || els.qrModal.classList.contains('hidden')) return;
    const peerCount = state.livePeers.length;
    if (state.liveStatus && state.liveStatus.state === 'live') {
      if (peerCount === 0) {
        els.qrLiveText.textContent = 'Live radar ready — scan with phone camera';
      } else {
        els.qrLiveText.textContent = `Live · ${peerCount + 1} people on radar!`;
      }
    } else {
      els.qrLiveText.textContent = 'Live radar ready — scan with phone camera';
    }
  }

  function closeQrModal() {
    if (els.qrModal) els.qrModal.classList.add('hidden');
  }

  function openQrModal() {
    const room = getActiveRoom();
    const palette = room.palette || 'wheel';
    const spotColor = ColorEngine.getSpotColor(state.spot.x, state.spot.y, palette);

    // 1. Ensure sessionId exists & live sync is started
    if (!state.sessionId && LiveSync) {
      state.sessionId = LiveSync.generateSessionId();
      try {
        sessionStorage.setItem(STORAGE_KEY_SESSION, state.sessionId);
      } catch (_) {}
    }
    ensureLiveClient();

    // 2. Build share URL & update URL hash
    const shareStateObj = {
      eventName: state.eventName,
      activeRoomId: state.activeRoomId,
      focusPinId: 'spot',
      pins: [
        {
          id: 'spot',
          name: getUserDisplayName(),
          roomId: state.activeRoomId,
          x: state.spot.x,
          y: state.spot.y,
          ts: Date.now(),
          colorName: spotColor.colorName
        }
      ],
      rooms: state.rooms,
      sessionId: state.sessionId
    };

    activeShareUrl = UrlState.buildShareUrl(shareStateObj);
    const hash = UrlState.encodeState(shareStateObj);
    window.history.replaceState(null, '', hash);
    updateHeader();

    // 3. Render Modal Content
    if (els.qrModalTitle) {
      els.qrModalTitle.textContent = `${state.eventName} · ${room.name}`;
    }
    if (els.qrSpotSummary) {
      els.qrSpotSummary.textContent = `${spotColor.colorName} · Zone ${spotColor.zoneCode}`;
    }
    updateQrLiveStatusText();

    if (els.qrSvgWrap && window.ChromaQR) {
      els.qrSvgWrap.innerHTML = window.ChromaQR.toSVG(activeShareUrl, { margin: 4 });
    }

    if (els.qrModal) {
      els.qrModal.classList.remove('hidden');
    }
  }

  /**
   * Dancefloor Join QR Code Modal Handlers
   */
  function setupQrModal() {
    if (els.btnShowQr) {
      els.btnShowQr.addEventListener('click', () => {
        openQrModal();
      });
    }

    if (els.btnCloseQr) {
      els.btnCloseQr.addEventListener('click', closeQrModal);
    }
    if (els.btnQrDone) {
      els.btnQrDone.addEventListener('click', closeQrModal);
    }

    if (els.qrModal) {
      els.qrModal.addEventListener('click', (e) => {
        if (e.target === els.qrModal) {
          closeQrModal();
        }
      });
    }

    if (els.btnQrCopy) {
      els.btnQrCopy.addEventListener('click', async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(activeShareUrl);
            const orig = els.btnQrCopy.textContent;
            els.btnQrCopy.textContent = '✓ Copied!';
            setTimeout(() => {
              if (els.btnQrCopy) els.btnQrCopy.textContent = orig;
            }, 2000);
          }
        } catch (_) {}
      });
    }
  }

  /**
   * Theme toggle
   */
  function setupTheme() {
    if (!els.btnThemeToggle) return;
    els.btnThemeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      els.btnThemeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
      try {
        localStorage.setItem(STORAGE_KEY_THEME, next);
      } catch (_) {}
    });
  }

  /**
   * Flip wheel button
   */
  function setupFlipWheel() {
    if (!els.btnFlipWheel) return;
    els.btnFlipWheel.addEventListener('click', () => {
      state.flipped = !state.flipped;
      updateOrientationHint();
      renderFloorCanvas();
      renderOverlay();
      showToast(state.flipped ? 'Flipped 180° perspective' : 'Default perspective');
    });
  }

  /**
   * Live Finder UI bindings
   */
  function setupLiveFinder() {
    if (els.liveNameInput) {
      if (state.userName) {
        els.liveNameInput.value = state.userName;
      }
      els.liveNameInput.addEventListener('input', () => {
        state.userName = els.liveNameInput.value;
        try {
          localStorage.setItem(STORAGE_KEY_USERNAME, state.userName);
        } catch (_) {}
        publishCurrentSpot();
      });
    }

    if (els.btnLiveToggle) {
      els.btnLiveToggle.addEventListener('click', async () => {
        if (!state.sessionId && LiveSync) {
          state.sessionId = LiveSync.generateSessionId();
          try {
            sessionStorage.setItem(STORAGE_KEY_SESSION, state.sessionId);
          } catch (_) {}
        }
        ensureLiveClient();

        // Also trigger share & copy with live link
        await handleOneClickShare();
      });
    }
  }

  /**
   * Initialization
   */
  function init() {
    initData();
    updateHeader();
    renderRoomTabs();
    updateOrientationHint();
    renderFloorCanvas();
    renderOverlay();
    updateSwatch();

    setupVenueMenu();
    setupLiveFinder();
    setupQrModal();
    setupMapInteractions();
    setupBeacon();
    setupGlobalKeyboard();
    setupTheme();
    setupFlipWheel();

    // Zero-friction activation: If sessionId exists on load, activate Live Finder immediately!
    if (state.sessionId) {
      ensureLiveClient();
    } else {
      renderLiveStatus();
    }

    if (els.btnShareSpot) {
      els.btnShareSpot.addEventListener('click', handleOneClickShare);
    }

    // Keep 2D rainbow wheel razor-sharp at native DPR whenever #map-viewport flexes or resizes
    if (window.ResizeObserver && els.mapViewport) {
      let lastObservedW = Math.round(els.mapViewport.getBoundingClientRect().width) || 0;
      let lastObservedH = Math.round(els.mapViewport.getBoundingClientRect().height) || 0;
      const viewportObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const cr = entry.contentRect;
          const w = Math.round(cr.width);
          const h = Math.round(cr.height);
          if (w > 0 && h > 0 && (w !== lastObservedW || h !== lastObservedH)) {
            lastObservedW = w;
            lastObservedH = h;
            window.requestAnimationFrame(() => {
              renderFloorCanvas();
              renderOverlay();
            });
          }
        }
      });
      viewportObserver.observe(els.mapViewport);
    }

    window.addEventListener('resize', () => {
      renderFloorCanvas();
      renderOverlay();
    });

    window.addEventListener('hashchange', () => {
      initData();
      updateHeader();
      renderRoomTabs();
      updateOrientationHint();
      renderFloorCanvas();
      renderOverlay();
      updateSwatch();
      if (els.venueMenuModal && !els.venueMenuModal.classList.contains('hidden')) {
        renderVenueMenu();
      }
      if (state.sessionId) {
        ensureLiveClient();
      } else {
        renderLiveStatus();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
