/**
 * ChromaFloor - Simple Sharing UI Controller (index.html)
 * Streamlined crowd locator: room tabs, 2D colour wheel radar, draggable spot reticle,
 * real-time swatch card & full-screen beacon, and 1-click spot copy/share.
 */
(function() {
  'use strict';

  const ColorEngine = window.ChromaColorEngine;
  const UrlState = window.ChromaUrlState;

  if (!ColorEngine || !UrlState) {
    console.error('[ChromaFloor] ChromaColorEngine and ChromaUrlState must be loaded before share-app.js');
    return;
  }

  // Storage Keys (Shared with setup-app.js)
  const STORAGE_KEY_EVENT = 'chromafloor_event_v2';
  const STORAGE_KEY_ROOMS = 'chromafloor_rooms_v2';
  const STORAGE_KEY_THEME = 'chromafloor_theme_v2';
  const STORAGE_KEY_SPOT = 'chromafloor_saved_spot_v2';

  // Application State
  const state = {
    eventName: 'My Event',
    activeRoomId: 'main',
    rooms: JSON.parse(JSON.stringify(ColorEngine.DEFAULT_ROOMS)),
    spot: { x: 0.50, y: 0.50 },
    friendPin: null, // Friend pin decoded from URL if present
    flipped: false,
    beaconOpen: false,
    beaconPulsing: false
  };

  // Helper: Element getter by primary ID or fallback ID
  function getEl(primaryId, fallbackId) {
    return document.getElementById(primaryId) || (fallbackId ? document.getElementById(fallbackId) : null);
  }

  // DOM Elements
  const els = {
    shareEventName: getEl('share-event-name', 'event-name-label'),
    linkToSetup: getEl('link-to-setup', 'btn-edit-layout'),
    btnThemeToggle: getEl('btn-theme-toggle'),
    roomTabs: getEl('room-tabs'),
    orientationHint: getEl('orientation-hint', 'orientation-label'),
    btnFlipWheel: getEl('btn-flip-wheel', 'btn-flip-view'),
    sharedFriendBanner: getEl('shared-friend-banner'),
    mapViewport: getEl('map-viewport'),
    floorCanvas: getEl('floor-canvas'),
    mapOverlay: getEl('map-overlay'),
    swatchCard: getEl('swatch-card'),
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
    toastContainer: getEl('toast-container')
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

        // Check for friend pins or shared spot in hash
        const pins = Array.isArray(decoded.pins) ? decoded.pins : [];
        if (pins.length > 0) {
          // If focusPinId is provided, find it, otherwise take first pin
          const targetPin = pins.find(p => p.id === decoded.focusPinId) || pins[0];
          if (targetPin) {
            state.friendPin = targetPin;
            if (targetPin.roomId) state.activeRoomId = targetPin.roomId;
            // Also position reticle at friend pin or slightly offset
            // We keep user spot distinct or initialize to friend's spot
            state.spot = { x: targetPin.x, y: targetPin.y };
          }
        }
      }
    }
  }

  /**
   * Synchronize UI header & link to setup
   */
  function updateHeader() {
    if (els.shareEventName) {
      els.shareEventName.textContent = state.eventName || 'ChromaFloor';
    }

    // Update link-to-setup href preserving full current state
    if (els.linkToSetup) {
      const setupUrl = UrlState.buildSetupUrl({
        eventName: state.eventName,
        activeRoomId: state.activeRoomId,
        rooms: state.rooms,
        pins: state.friendPin ? [state.friendPin] : []
      });
      if (els.linkToSetup.tagName.toLowerCase() === 'a') {
        els.linkToSetup.href = setupUrl;
      } else {
        els.linkToSetup.onclick = () => { window.location.href = setupUrl; };
      }
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
        renderFloorCanvas();
        renderOverlay();
        updateSwatch();
        updateHeader();
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
   * Updates spot swatch card and full-screen beacon info
   */
  function updateSwatch() {
    const room = getActiveRoom();
    const palette = room.palette || 'wheel';
    const spotColor = ColorEngine.getSpotColor(state.spot.x, state.spot.y, palette);
    const nearest = ColorEngine.getNearestLandmark(state.spot.x, state.spot.y, room);

    // Update Swatch Card
    if (els.swatchColorName) {
      els.swatchColorName.textContent = spotColor.colorName;
    }

    const metaParts = [`Zone ${spotColor.zoneCode}`, spotColor.hex, spotColor.fullPositionLabel];
    if (nearest.phrase) metaParts.push(nearest.phrase);

    if (els.swatchMeta) {
      els.swatchMeta.textContent = metaParts.join(' · ');
    }

    if (els.swatchCard) {
      els.swatchCard.style.backgroundColor = spotColor.hex;
      els.swatchCard.style.color = spotColor.textColor;
      // Border or glowing accent
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
   * Renders the interactive map overlay:
   * - Placed landmark pills (Stage, Bar, DJ, etc.)
   * - Draggable user reticle marker with live floating label
   * - Pulsing friend pin banner and marker (if shared pin exists)
   */
  function renderOverlay() {
    if (!els.mapOverlay) return;
    els.mapOverlay.innerHTML = '';

    const room = getActiveRoom();
    const palette = room.palette || 'wheel';
    const spotColor = ColorEngine.getSpotColor(state.spot.x, state.spot.y, palette);

    // 1. Friend Shared Spot Banner
    if (state.friendPin && state.friendPin.roomId === state.activeRoomId) {
      if (els.sharedFriendBanner) {
        els.sharedFriendBanner.classList.remove('hidden');
        const friendColorName = state.friendPin.colorName || 'Shared Spot';
        const friendNearest = ColorEngine.getNearestLandmark(state.friendPin.x, state.friendPin.y, room);
        const nearText = friendNearest.phrase ? ` · ${friendNearest.phrase}` : '';
        els.sharedFriendBanner.innerHTML = `
          <div class="friend-banner-content">
            <span class="friend-dot"></span>
            <span>📍 Friend's spot: <strong>${friendColorName}</strong>${nearText}</span>
          </div>
          <button type="button" class="friend-banner-close" aria-label="Dismiss banner">✕</button>
        `;
        const closeBtn = els.sharedFriendBanner.querySelector('.friend-banner-close');
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            els.sharedFriendBanner.classList.add('hidden');
          });
        }
      }

      // Render Friend Pin on Floor
      const friendX = state.flipped ? (1 - state.friendPin.x) : state.friendPin.x;
      const friendY = state.flipped ? (1 - state.friendPin.y) : state.friendPin.y;
      const friendPinEl = document.createElement('div');
      friendPinEl.className = 'friend-pin-marker';
      friendPinEl.style.left = `${friendX * 100}%`;
      friendPinEl.style.top = `${friendY * 100}%`;
      friendPinEl.innerHTML = `
        <div class="friend-pin-pulse"></div>
        <div class="friend-pin-dot"></div>
        <div class="friend-pin-label">${state.friendPin.name || 'Friend'}</div>
      `;
      friendPinEl.addEventListener('click', (e) => {
        e.stopPropagation();
        // Snap user spot to friend
        state.spot = { x: state.friendPin.x, y: state.friendPin.y };
        renderOverlay();
        updateSwatch();
        showToast(`📍 Snapped to friend's spot!`);
      });
      els.mapOverlay.appendChild(friendPinEl);
    } else if (els.sharedFriendBanner) {
      els.sharedFriendBanner.classList.add('hidden');
    }

    // 2. Render Placed Landmarks
    const landmarks = Array.isArray(room.landmarks) ? room.landmarks : [];
    landmarks.forEach(lm => {
      const posX = state.flipped ? (1 - lm.x) : lm.x;
      const posY = state.flipped ? (1 - lm.y) : lm.y;

      const pill = document.createElement('div');
      pill.className = `landmark-pill landmark-${lm.type || 'custom'}`;
      pill.style.left = `${posX * 100}%`;
      pill.style.top = `${posY * 100}%`;
      pill.dataset.type = lm.type || 'custom';
      pill.innerHTML = `
        <span class="landmark-icon">${lm.icon || '📍'}</span>
        <span class="landmark-title">${lm.name}</span>
      `;
      // Tapping a landmark gently snaps reticle to it!
      pill.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        state.spot = { x: lm.x, y: lm.y };
        renderOverlay();
        updateSwatch();
        showToast(`Snapped to ${lm.name}`);
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

    // Build URL hash with spot
    const shareStateObj = {
      eventName: state.eventName,
      activeRoomId: state.activeRoomId,
      focusPinId: 'spot',
      pins: [
        {
          id: 'spot',
          name: 'Shared Spot',
          roomId: state.activeRoomId,
          x: state.spot.x,
          y: state.spot.y,
          ts: Date.now(),
          colorName: spotColor.colorName
        }
      ],
      rooms: state.rooms
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

    // 3. UI feedback
    if (els.shareBtnLabel) {
      const origText = els.shareBtnLabel.textContent;
      els.shareBtnLabel.textContent = '✓ Copied My Spot & Link!';
      setTimeout(() => {
        els.shareBtnLabel.textContent = origText;
      }, 3000);
    } else if (els.btnShareSpot) {
      const origText = els.btnShareSpot.textContent;
      els.btnShareSpot.textContent = '✓ Copied Spot Link!';
      setTimeout(() => {
        els.btnShareSpot.textContent = origText;
      }, 3000);
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

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.beaconOpen) {
        if (els.beaconCloseBtn) els.beaconCloseBtn.click();
      }
    });
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

    setupMapInteractions();
    setupBeacon();
    setupTheme();
    setupFlipWheel();

    if (els.btnShareSpot) {
      els.btnShareSpot.addEventListener('click', handleOneClickShare);
    }

    window.addEventListener('resize', () => {
      renderFloorCanvas();
      renderOverlay();
    });

    window.addEventListener('hashchange', () => {
      initData();
      updateHeader();
      renderRoomTabs();
      renderFloorCanvas();
      renderOverlay();
      updateSwatch();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
