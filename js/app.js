/**
 * ChromaFloor - Core Application Controller
 * Wires stage canvas radar, interactive overlay pins/sightlines, room switching,
 * group chat message sharing, walk simulator, and crowd color beacon.
 */
(function() {
  'use strict';

  const ColorEngine = window.ChromaColorEngine;
  const UrlState = window.ChromaUrlState;

  if (!ColorEngine || !UrlState) {
    console.error('[ChromaFloor] Required modules ChromaColorEngine or ChromaUrlState are missing!');
    return;
  }

  // Storage Keys
  const STORAGE_KEY_EVENT = 'chromafloor_event_name';
  const STORAGE_KEY_USER_NAME = 'chromafloor_user_name';
  const STORAGE_KEY_CUSTOM_ROOMS = 'chromafloor_custom_rooms';
  const STORAGE_KEY_SAVED_SPOT = 'chromafloor_saved_spot';

  // Demo Crew Profiles (matching specification)
  function createDemoCrew() {
    const now = Date.now();
    return [
      {
        id: 'demo-maya',
        name: 'Maya',
        roomId: 'main',
        x: 0.38,
        y: 0.28,
        ts: now - 2 * 60000,
        colorName: 'Lime',
        note: 'Holding neon sunflower totem'
      },
      {
        id: 'demo-liam',
        name: 'Liam',
        roomId: 'main',
        x: 0.65,
        y: 0.52,
        ts: now - 5 * 60000,
        colorName: 'Azure',
        note: 'Near center right, black hoodie'
      },
      {
        id: 'demo-zoe',
        name: 'Zoe',
        roomId: 'warehouse',
        x: 0.30,
        y: 0.36,
        ts: now - 9 * 60000,
        colorName: 'Lime',
        note: 'Left of sound desk'
      },
      {
        id: 'demo-kai',
        name: 'Kai',
        roomId: 'warehouse',
        x: 0.74,
        y: 0.50,
        ts: now - 12 * 60000,
        colorName: 'Cobalt',
        note: 'Getting drinks by side bar'
      }
    ];
  }

  // Application State
  const state = {
    eventName: 'Festival',
    activeRoomId: 'main',
    flipped: false,
    showGrid: true,
    gpsActive: false,
    gpsCoords: null,
    includeCrewInShare: true,
    draftSpot: { x: 0.50, y: 0.56 }, // Default reticle position
    userSpot: null,
    userDropped: false,
    userName: 'You',
    userNote: '',
    selectedCrewId: 'demo-maya',
    demoCrewActive: true,
    customRooms: [],
    pins: createDemoCrew(),
    beaconOpen: false,
    beaconPulsing: false,
    walkingSimActive: false,
    walkingSimTimer: null
  };

  // Load custom rooms and preferences from localStorage
  try {
    const savedEvent = localStorage.getItem(STORAGE_KEY_EVENT);
    if (savedEvent) state.eventName = savedEvent;

    const savedName = localStorage.getItem(STORAGE_KEY_USER_NAME);
    if (savedName) state.userName = savedName;

    const savedCustomRooms = localStorage.getItem(STORAGE_KEY_CUSTOM_ROOMS);
    if (savedCustomRooms) {
      const parsed = JSON.parse(savedCustomRooms);
      if (Array.isArray(parsed)) state.customRooms = parsed;
    }

    const savedSpotJson = localStorage.getItem(STORAGE_KEY_SAVED_SPOT);
    if (savedSpotJson) {
      const savedSpot = JSON.parse(savedSpotJson);
      if (savedSpot && typeof savedSpot.x === 'number' && typeof savedSpot.y === 'number') {
        state.userSpot = savedSpot;
        state.draftSpot = { x: savedSpot.x, y: savedSpot.y };
        state.userDropped = true;
      }
    }
  } catch (err) {
    console.warn('[ChromaFloor] LocalStorage read warning:', err);
  }

  // Combine default rooms with any user-created custom rooms
  function getAllRooms() {
    return [...ColorEngine.DEFAULT_ROOMS, ...state.customRooms];
  }

  function getActiveRoom() {
    const rooms = getAllRooms();
    return rooms.find(r => r.id === state.activeRoomId) || rooms[0] || ColorEngine.DEFAULT_ROOMS[0];
  }

  // DOM Elements Cache
  const els = {
    // Header
    eventBadgeBtn: document.getElementById('event-badge-btn'),
    eventNameLabel: document.getElementById('event-name-label'),
    btnDemoCrew: document.getElementById('btn-demo-crew'),
    btnThemeToggle: document.getElementById('btn-theme-toggle'),

    // Rooms
    roomTabs: document.getElementById('room-tabs'),
    btnAddRoom: document.getElementById('btn-add-room'),
    addRoomModal: document.getElementById('add-room-modal'),
    newRoomName: document.getElementById('new-room-name'),
    newRoomWidth: document.getElementById('new-room-width'),
    newRoomDepth: document.getElementById('new-room-depth'),
    newRoomShape: document.getElementById('new-room-shape'),
    btnSaveRoom: document.getElementById('btn-save-room'),
    btnCancelRoom: document.getElementById('btn-cancel-room'),

    // Map & Canvas
    mapViewport: document.getElementById('map-viewport'),
    floorCanvas: document.getElementById('floor-canvas'),
    mapOverlay: document.getElementById('map-overlay'),
    orientationLabel: document.getElementById('orientation-label'),
    btnFlipView: document.getElementById('btn-flip-view'),
    btnToggleGrid: document.getElementById('btn-toggle-grid'),
    btnGpsAssist: document.getElementById('btn-gps-assist'),
    entranceLabel: document.getElementById('entrance-label'),
    roomDimensionsLabel: document.getElementById('room-dimensions-label'),
    quickSnapList: document.getElementById('quick-snap-list'),

    // Right Panel Controls
    swatchCard: document.getElementById('swatch-card'),
    swatchZoneBadge: document.getElementById('swatch-zone-badge'),
    swatchColorName: document.getElementById('swatch-color-name'),
    swatchHex: document.getElementById('swatch-hex'),
    swatchPositionMeta: document.getElementById('swatch-position-meta'),

    userNameInput: document.getElementById('user-name-input'),
    userNoteInput: document.getElementById('user-note-input'),
    notePresetChips: document.getElementById('note-preset-chips'),
    attachGpsCheckbox: document.getElementById('attach-gps-checkbox'),
    gpsStatusText: document.getElementById('gps-status-text'),

    btnDropShare: document.getElementById('btn-drop-share'),
    btnCopyLink: document.getElementById('btn-copy-link'),

    // Group chat share buttons
    btnShareNative: document.getElementById('btn-share-native'),
    btnShareWhatsapp: document.getElementById('btn-share-whatsapp'),
    btnShareTelegram: document.getElementById('btn-share-telegram'),
    btnShareSms: document.getElementById('btn-share-sms'),
    btnCopyMessage: document.getElementById('btn-copy-message'),

    includeCrewCheckbox: document.getElementById('include-crew-checkbox'),
    chatPreviewCount: document.getElementById('chat-preview-count'),
    chatMessagePreview: document.getElementById('chat-message-preview'),

    // Wayfinder & Crew
    crewWayfinderCard: document.getElementById('crew-wayfinder-card'),
    crewActiveCount: document.getElementById('crew-active-count'),
    btnWalkSim: document.getElementById('btn-walk-sim'),
    crewList: document.getElementById('crew-list'),
    wayfinderBanner: document.getElementById('wayfinder-banner'),
    wayfinderHeadline: document.getElementById('wayfinder-headline'),
    wayfinderTarget: document.getElementById('wayfinder-target'),
    wayfinderGradientBar: document.getElementById('wayfinder-gradient-bar'),
    wayfinderShiftText: document.getElementById('wayfinder-shift-text'),
    wayfinderLandmarkText: document.getElementById('wayfinder-landmark-text'),

    // Color Beacon
    btnFlashBeacon: document.getElementById('btn-flash-beacon'),
    beaconModal: document.getElementById('beacon-modal'),
    beaconPulseBtn: document.getElementById('beacon-pulse-btn'),
    beaconCloseBtn: document.getElementById('beacon-close-btn'),
    beaconRoomLabel: document.getElementById('beacon-room-label'),
    beaconZoneCode: document.getElementById('beacon-zone-code'),
    beaconColorTitle: document.getElementById('beacon-color-title'),
    beaconHexCode: document.getElementById('beacon-hex-code'),
    beaconUserMeta: document.getElementById('beacon-user-meta'),
    beaconBrightnessTip: document.getElementById('beacon-brightness-tip')
  };

  // Toast feedback helper
  let toastTimer = null;
  function showToast(text, isError = false) {
    let toast = document.getElementById('chroma-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'chroma-toast';
      toast.className = 'fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl font-semibold text-xs shadow-2xl flex items-center gap-2 pointer-events-none transition-all duration-300 transform opacity-0 translate-y-3';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.backgroundColor = isError ? '#EF4444' : '#10B981';
    toast.style.color = '#FFFFFF';
    toast.classList.remove('opacity-0', 'translate-y-3');
    toast.classList.add('opacity-100', 'translate-y-0');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('opacity-100', 'translate-y-0');
      toast.classList.add('opacity-0', 'translate-y-3');
    }, 2800);
  }

  // Floor Background Cache
  let cachedFloorCanvas = null;
  let cachedFloorKey = '';

  /**
   * High-DPI Responsive Canvas Renderer
   */
  function renderCanvas() {
    if (!els.floorCanvas) return;
    const canvas = els.floorCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const room = getActiveRoom();
    const key = `${width}x${height}:${state.flipped}:${room.shape}`;

    if (!cachedFloorCanvas || cachedFloorKey !== key) {
      cachedFloorCanvas = ColorEngine.createFloorBackground(width, height, state.flipped, room.shape);
      cachedFloorKey = key;
    }

    ctx.clearRect(0, 0, width, height);

    // 1. Draw smooth rainbow floor
    if (cachedFloorCanvas) {
      ctx.drawImage(cachedFloorCanvas, 0, 0, width, height);
    }

    ctx.save();

    // 2. Concentric acoustic waves radiating from stage
    const originX = width * 0.5;
    const originY = room.shape === 'dome'
      ? height * 0.35
      : (state.flipped ? height : 0);
    const waveStep = Math.round(Math.min(width, height) / 6.5);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.8;
    for (let r = waveStep; r < Math.hypot(width, height); r += waveStep) {
      ctx.beginPath();
      ctx.arc(originX, originY, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3. 8x8 Grid lines & headers (when toggled on)
    if (state.showGrid) {
      const colW = width / 8;
      const rowH = height / 8;

      ctx.lineWidth = 1;
      // Vertical grid lines
      for (let i = 1; i < 8; i++) {
        const gx = Math.round(i * colW);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.beginPath(); ctx.moveTo(gx + 1, 0); ctx.lineTo(gx + 1, height); ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, height); ctx.stroke();
      }
      // Horizontal grid lines
      for (let j = 1; j < 8; j++) {
        const gy = Math.round(j * rowH);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.beginPath(); ctx.moveTo(0, gy + 1); ctx.lineTo(width, gy + 1); ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(width, gy); ctx.stroke();
      }

      // Column letters along top
      ctx.fillStyle = 'rgba(255, 255, 255, 0.70)';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let i = 0; i < 8; i++) {
        const letter = state.flipped ? ColorEngine.ZONE_COLUMNS[7 - i] : ColorEngine.ZONE_COLUMNS[i];
        ctx.fillText(letter, (i + 0.5) * colW, 8);
      }

      // Row numbers along left edge
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (let j = 0; j < 8; j++) {
        const num = state.flipped ? (8 - j) : (j + 1);
        ctx.fillText(String(num), 8, (j + 0.5) * rowH);
      }
    }

    // 4. Animated dashed sightline to selected crew member
    const selectedFriend = state.pins.find(p => p.id === state.selectedCrewId && p.roomId === state.activeRoomId);
    const mySpot = (state.userDropped && state.userSpot && state.userSpot.roomId === state.activeRoomId)
      ? state.userSpot
      : state.draftSpot;

    if (selectedFriend && mySpot) {
      const fromPx = (state.flipped ? (1 - mySpot.x) : mySpot.x) * width;
      const fromPy = (state.flipped ? (1 - mySpot.y) : mySpot.y) * height;
      const toPx = (state.flipped ? (1 - selectedFriend.x) : selectedFriend.x) * width;
      const toPy = (state.flipped ? (1 - selectedFriend.y) : selectedFriend.y) * height;

      const distPx = Math.hypot(toPx - fromPx, toPy - fromPy);
      if (distPx > 14) {
        // Dark contrast under-stroke
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(fromPx, fromPy);
        ctx.lineTo(toPx, toPy);
        ctx.stroke();

        // Amber dashed line
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 3.5;
        ctx.setLineDash([9, 6]);
        ctx.lineDashOffset = -Date.now() / 40;
        ctx.beginPath();
        ctx.moveTo(fromPx, fromPy);
        ctx.lineTo(toPx, toPy);
        ctx.stroke();
        ctx.setLineDash([]);

        // Directional arrowhead
        const angle = Math.atan2(toPy - fromPy, toPx - fromPx);
        const arrowDist = Math.max(16, distPx - 20);
        const arrowX = fromPx + arrowDist * Math.cos(angle);
        const arrowY = fromPy + arrowDist * Math.sin(angle);

        ctx.fillStyle = '#F59E0B';
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(arrowX - 14 * Math.cos(angle - Math.PI / 6), arrowY - 14 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(arrowX - 14 * Math.cos(angle + Math.PI / 6), arrowY - 14 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();
  }

  /**
   * Syncs DOM overlay markers (landmarks, crew pins, sightline badge, reticle)
   */
  function syncOverlay() {
    if (!els.mapOverlay || !els.floorCanvas) return;
    const room = getActiveRoom();
    const overlay = els.mapOverlay;
    overlay.innerHTML = '';

    // 1. Landmarks
    (room.landmarks || []).forEach(lm => {
      const pxPercent = (state.flipped ? (1 - lm.x) : lm.x) * 100;
      const pyPercent = (state.flipped ? (1 - lm.y) : lm.y) * 100;

      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'landmark-pill absolute -translate-x-1/2 -translate-y-1/2 px-2.5 py-1 rounded-full bg-black/75 hover:bg-black text-white text-xs font-semibold flex items-center gap-1.5 shadow-md border border-white/20 transition-transform active:scale-95 cursor-pointer z-10';
      pill.style.left = `${pxPercent}%`;
      pill.style.top = `${pyPercent}%`;
      pill.innerHTML = `<span>${lm.icon || '📍'}</span><span class="truncate max-w-[100px]">${lm.name}</span>`;

      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        state.draftSpot = { x: lm.x, y: lm.y };
        updateAll();
        showToast(`Snapped to ${lm.name}`);
      });

      overlay.appendChild(pill);
    });

    // 2. Crew Pins in active room
    const currentCrew = state.pins.filter(p => p.roomId === state.activeRoomId);
    currentCrew.forEach(pin => {
      const isSelected = pin.id === state.selectedCrewId;
      const pxPercent = (state.flipped ? (1 - pin.x) : pin.x) * 100;
      const pyPercent = (state.flipped ? (1 - pin.y) : pin.y) * 100;
      const spotColor = ColorEngine.getSpotColor(pin.x, pin.y);

      // Relative time formatted
      const minutesAgo = Math.max(1, Math.round((Date.now() - (pin.ts || Date.now())) / 60000));
      const timeStr = minutesAgo < 60 ? `${minutesAgo}m ago` : `${Math.floor(minutesAgo / 60)}h ago`;

      const pinEl = document.createElement('div');
      pinEl.className = `crew-pin ${isSelected ? 'selected' : ''}`;
      pinEl.style.left = `${pxPercent}%`;
      pinEl.style.top = `${pyPercent}%`;

      const initial = (pin.name || 'F').charAt(0).toUpperCase();

      pinEl.innerHTML = `
        <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shadow-lg transition-all ${
          isSelected
            ? 'ring-4 ring-[#F59E0B] ring-offset-2 ring-offset-black scale-105'
            : 'border-2 border-white'
        }" style="background-color: ${spotColor.hex}; color: ${spotColor.textColor}">
          ${initial}
        </div>
        <div class="crew-pin-tag mt-1 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-sm border border-white/20 text-white font-medium text-[11px] whitespace-nowrap shadow-md flex items-center gap-1">
          <span>${pin.name}</span>
          <span class="opacity-60 text-[10px]">${timeStr}</span>
        </div>
      `;

      pinEl.addEventListener('click', (e) => {
        e.stopPropagation();
        state.selectedCrewId = pin.id;
        updateAll();
        showToast(`Guidance sightline locked to ${pin.name}`);
      });

      overlay.appendChild(pinEl);
    });

    // 3. User Dropped Pin (if in active room)
    if (state.userDropped && state.userSpot && state.userSpot.roomId === state.activeRoomId) {
      const uSpot = state.userSpot;
      const pxPercent = (state.flipped ? (1 - uSpot.x) : uSpot.x) * 100;
      const pyPercent = (state.flipped ? (1 - uSpot.y) : uSpot.y) * 100;
      const uColor = ColorEngine.getSpotColor(uSpot.x, uSpot.y);

      const uPin = document.createElement('div');
      uPin.className = 'user-pin absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none z-20';
      uPin.style.left = `${pxPercent}%`;
      uPin.style.top = `${pyPercent}%`;
      uPin.innerHTML = `
        <div class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] shadow-lg border-2 border-white" style="background-color: ${uColor.hex}; color: ${uColor.textColor}">
          ★
        </div>
        <div class="mt-1 px-2 py-0.5 rounded-md bg-emerald-700/90 border border-white/20 text-white font-bold text-[10px] whitespace-nowrap shadow-md">
          YOU (${state.userName})
        </div>
      `;
      overlay.appendChild(uPin);
    }

    // 4. Sightline Midpoint Badge
    const activeTarget = state.pins.find(p => p.id === state.selectedCrewId && p.roomId === state.activeRoomId);
    const originSpot = (state.userDropped && state.userSpot && state.userSpot.roomId === state.activeRoomId)
      ? state.userSpot
      : state.draftSpot;

    if (activeTarget && originSpot) {
      const fromX = (state.flipped ? (1 - originSpot.x) : originSpot.x);
      const fromY = (state.flipped ? (1 - originSpot.y) : originSpot.y);
      const toX = (state.flipped ? (1 - activeTarget.x) : activeTarget.x);
      const toY = (state.flipped ? (1 - activeTarget.y) : activeTarget.y);

      const midX = (fromX + toX) * 0.5 * 100;
      const midY = (fromY + toY) * 0.5 * 100;

      const directions = ColorEngine.getWalkingDirections(originSpot, activeTarget, room);

      if (directions.meters > 3) {
        const badge = document.createElement('div');
        badge.className = 'sightline-badge absolute -translate-x-1/2 -translate-y-1/2 px-2.5 py-1 rounded-full bg-amber-500 text-black font-extrabold text-xs shadow-xl border border-white/30 z-20 flex items-center gap-1';
        badge.style.left = `${midX}%`;
        badge.style.top = `${midY}%`;
        badge.textContent = directions.meters <= 15
          ? `${directions.meters}m · ${directions.steps} steps`
          : `${directions.meters}m`;

        overlay.appendChild(badge);
      }
    }

    // 5. Active Reticle Marker at draftSpot
    const dSpot = state.draftSpot;
    const rXPercent = (state.flipped ? (1 - dSpot.x) : dSpot.x) * 100;
    const rYPercent = (state.flipped ? (1 - dSpot.y) : dSpot.y) * 100;
    const dColor = ColorEngine.getSpotColor(dSpot.x, dSpot.y);

    const reticle = document.createElement('div');
    reticle.className = 'reticle-marker absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30 flex flex-col items-center';
    reticle.style.left = `${rXPercent}%`;
    reticle.style.top = `${rYPercent}%`;

    // Flip label below marker if near the top edge (< 18%) so it never clips!
    const isNearTop = (state.flipped ? (1 - dSpot.y) : dSpot.y) < 0.18;

    reticle.innerHTML = `
      ${!isNearTop ? `
        <div class="reticle-label mb-2 px-2.5 py-1 rounded-lg bg-black/85 backdrop-blur-sm border border-white/20 text-white text-xs font-bold shadow-2xl flex items-center gap-2 whitespace-nowrap">
          <span class="w-3 h-3 rounded shrink-0 shadow-sm border border-black/40" style="background-color: ${dColor.hex}"></span>
          <span>${dColor.colorName} · ${dColor.zoneCode}</span>
        </div>
      ` : ''}
      <div class="relative w-10 h-10 flex items-center justify-center">
        <!-- Target outer pulse circle -->
        <div class="absolute inset-0 rounded-full border-2 border-white/90 shadow-lg"></div>
        <div class="absolute w-12 h-[2px] bg-white/80"></div>
        <div class="absolute h-12 w-[2px] bg-white/80"></div>
        <div class="w-3.5 h-3.5 rounded-full border border-black shadow" style="background-color: ${dColor.hex}"></div>
      </div>
      ${isNearTop ? `
        <div class="reticle-label mt-2 px-2.5 py-1 rounded-lg bg-black/85 backdrop-blur-sm border border-white/20 text-white text-xs font-bold shadow-2xl flex items-center gap-2 whitespace-nowrap">
          <span class="w-3 h-3 rounded shrink-0 shadow-sm border border-black/40" style="background-color: ${dColor.hex}"></span>
          <span>${dColor.colorName} · ${dColor.zoneCode}</span>
        </div>
      ` : ''}
    `;

    overlay.appendChild(reticle);
  }

  /**
   * Updates state from pointer / touch coordinates on the viewport
   */
  function handlePointer(clientX, clientY, checkCrewClick) {
    if (!els.floorCanvas) return false;
    const rect = els.floorCanvas.getBoundingClientRect();
    const clampedX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const clampedY = Math.max(0, Math.min(rect.height, clientY - rect.top));

    let normX = clampedX / rect.width;
    let normY = clampedY / rect.height;

    if (state.flipped) {
      normX = 1 - normX;
      normY = 1 - normY;
    }

    // Check click on crew member pin
    if (checkCrewClick) {
      const hit = state.pins.find(p => p.roomId === state.activeRoomId && Math.hypot(p.x - normX, p.y - normY) < 0.075);
      if (hit) {
        state.selectedCrewId = hit.id;
        updateAll();
        showToast(`Guidance sightline locked to ${hit.name}`);
        return true;
      }
    }

    state.draftSpot = {
      x: Math.max(0, Math.min(1, Math.round(normX * 1000) / 1000)),
      y: Math.max(0, Math.min(1, Math.round(normY * 1000) / 1000))
    };

    updateAll();
    return false;
  }

  /**
   * Builds the current share state object and share URL
   */
  function getCurrentSharePayload() {
    const room = getActiveRoom();
    const dColor = ColorEngine.getSpotColor(state.draftSpot.x, state.draftSpot.y);
    const nearest = ColorEngine.getNearestLandmark(state.draftSpot.x, state.draftSpot.y, room);

    const safeName = (els.userNameInput ? els.userNameInput.value.trim() : state.userName) || 'You';
    const safeNote = (els.userNoteInput ? els.userNoteInput.value.trim() : state.userNote) || '';

    const myPin = {
      id: 'me',
      name: safeName,
      roomId: state.activeRoomId,
      x: state.draftSpot.x,
      y: state.draftSpot.y,
      ts: Date.now(),
      colorName: dColor.colorName,
      zoneCode: dColor.zoneCode,
      hex: dColor.hex,
      note: safeNote,
      lat: (state.gpsActive && state.gpsCoords) ? state.gpsCoords.latitude : null,
      lng: (state.gpsActive && state.gpsCoords) ? state.gpsCoords.longitude : null
    };

    // Filter pins based on includeCrew checkbox
    const otherPins = state.includeCrewInShare ? state.pins : [];
    const allPins = [myPin, ...otherPins.filter(p => p.id !== 'me')];

    const stateObj = {
      eventName: state.eventName,
      activeRoomId: state.activeRoomId,
      focusPinId: 'me',
      pins: allPins
    };

    const shareUrl = UrlState.buildShareUrl(stateObj);
    const messages = UrlState.buildChatMessages({
      userPin: myPin,
      room,
      eventName: state.eventName,
      crewCount: allPins.length,
      shareUrl,
      nearestPhrase: nearest.phrase || dColor.fullPositionLabel
    });

    return {
      stateObj,
      shareUrl,
      previewText: messages.previewText,
      fullMessage: messages.fullMessage,
      myPin,
      dColor,
      room,
      nearest
    };
  }

  /**
   * Updates all UI widgets, cards, inputs, and previews
   */
  function updateAll() {
    const room = getActiveRoom();
    const dColor = ColorEngine.getSpotColor(state.draftSpot.x, state.draftSpot.y);
    const nearest = ColorEngine.getNearestLandmark(state.draftSpot.x, state.draftSpot.y, room);

    // 1. Header & Event Name
    if (els.eventNameLabel) {
      els.eventNameLabel.textContent = state.eventName;
    }
    if (els.btnDemoCrew) {
      els.btnDemoCrew.classList.toggle('bg-amber-500/20', state.demoCrewActive);
    }

    // 2. Room Tabs
    if (els.roomTabs) {
      els.roomTabs.innerHTML = '';
      const allRooms = getAllRooms();
      allRooms.forEach(r => {
        const count = state.pins.filter(p => p.roomId === r.id).length
          + (state.userDropped && state.userSpot && state.userSpot.roomId === r.id ? 1 : 0);
        const isActive = r.id === state.activeRoomId;

        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = `room-tab ${isActive ? 'active' : ''}`;
        tab.innerHTML = `<span>${r.name}</span><span class="room-tab-count">${count}</span>`;

        tab.addEventListener('click', () => {
          state.activeRoomId = r.id;
          const firstCrewInRoom = state.pins.find(p => p.roomId === r.id);
          if (firstCrewInRoom) {
            state.selectedCrewId = firstCrewInRoom.id;
          }
          cachedFloorCanvas = null;
          updateAll();
        });

        els.roomTabs.appendChild(tab);
      });
    }

    // 3. Map Viewport Meta
    if (els.orientationLabel) {
      els.orientationLabel.textContent = state.flipped ? '● FACING ENTRANCE (STAGE BEHIND) ↓' : '● FACING STAGE ↑';
    }
    if (els.entranceLabel) {
      els.entranceLabel.textContent = state.flipped ? '↑ STAGE / DJ BOOTH' : '↓ BACK ENTRANCE / MAIN ARCH';
    }
    if (els.roomDimensionsLabel) {
      els.roomDimensionsLabel.textContent = `${room.widthMeters}M × ${room.depthMeters}M`;
    }

    // 4. Quick Snap List
    if (els.quickSnapList) {
      els.quickSnapList.innerHTML = '';
      const snaps = [
        ...(room.landmarks || []).map(lm => ({ name: lm.name, x: lm.x, y: lm.y })),
        { name: 'Center Floor', x: 0.50, y: 0.50 },
        { name: 'Front Rail', x: 0.50, y: 0.08 }
      ];

      snaps.forEach(s => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'snap-btn px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/15 text-white/90 text-xs font-medium transition-colors shrink-0';
        btn.textContent = s.name;
        btn.addEventListener('click', () => {
          state.draftSpot = { x: s.x, y: s.y };
          updateAll();
          showToast(`Snapped to ${s.name}`);
        });
        els.quickSnapList.appendChild(btn);
      });
    }

    // 5. Spot Swatch Card
    if (els.swatchCard) {
      els.swatchCard.style.backgroundColor = dColor.hex;
      els.swatchCard.style.color = dColor.textColor;
    }
    if (els.swatchZoneBadge) {
      els.swatchZoneBadge.textContent = dColor.zoneCode;
    }
    if (els.swatchColorName) {
      els.swatchColorName.textContent = dColor.colorName;
    }
    if (els.swatchHex) {
      els.swatchHex.textContent = dColor.hex;
    }
    if (els.swatchPositionMeta) {
      els.swatchPositionMeta.textContent = `${dColor.fullPositionLabel} · ${nearest.phrase}`;
    }

    // 6. Crew List & Wayfinder
    const activeCrew = state.pins.filter(p => p.roomId === state.activeRoomId);
    if (els.crewActiveCount) {
      els.crewActiveCount.textContent = `${activeCrew.length + (state.userDropped ? 1 : 0)} active`;
    }

    if (els.crewList) {
      els.crewList.innerHTML = '';
      state.pins.forEach(pin => {
        const pColor = ColorEngine.getSpotColor(pin.x, pin.y);
        const isSelected = pin.id === state.selectedCrewId;
        const minutesAgo = Math.max(1, Math.round((Date.now() - (pin.ts || Date.now())) / 60000));
        const timeStr = minutesAgo < 60 ? `${minutesAgo}m ago` : `${Math.floor(minutesAgo / 60)}h ago`;

        const card = document.createElement('button');
        card.type = 'button';
        card.className = `crew-card ${isSelected ? 'selected' : ''}`;
        card.innerHTML = `
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-4 h-4 rounded-full shrink-0 border border-black/30 shadow-sm" style="background-color: ${pColor.hex}"></span>
            <div class="flex flex-col min-w-0">
              <span class="font-bold text-xs truncate text-white">${pin.name}</span>
              <span class="text-[10px] text-white/60 truncate">${pin.note || pColor.colorName}</span>
            </div>
          </div>
          <div class="flex flex-col items-end shrink-0 leading-tight">
            <span class="font-mono font-bold text-xs text-white/90">${pColor.zoneCode}</span>
            <span class="text-[10px] text-white/50">${timeStr}</span>
          </div>
        `;

        card.addEventListener('click', () => {
          state.selectedCrewId = pin.id;
          state.activeRoomId = pin.roomId;
          cachedFloorCanvas = null;
          updateAll();
        });

        els.crewList.appendChild(card);
      });
    }

    // Wayfinder banner
    const selectedFriend = state.pins.find(p => p.id === state.selectedCrewId) || state.pins[0];
    if (selectedFriend && els.wayfinderBanner) {
      const origin = (state.userDropped && state.userSpot && state.userSpot.roomId === selectedFriend.roomId)
        ? state.userSpot
        : state.draftSpot;
      const friendRoom = getAllRooms().find(r => r.id === selectedFriend.roomId) || room;
      const directions = ColorEngine.getWalkingDirections(origin, selectedFriend, friendRoom);

      if (els.wayfinderHeadline) els.wayfinderHeadline.textContent = directions.headline;
      if (els.wayfinderTarget) els.wayfinderTarget.textContent = `→ ${selectedFriend.name} (${directions.toColor.zoneCode})`;
      if (els.wayfinderGradientBar) {
        els.wayfinderGradientBar.style.background = `linear-gradient(90deg, ${directions.fromColor.hex} 0%, ${directions.toColor.hex} 100%)`;
      }
      if (els.wayfinderShiftText) {
        els.wayfinderShiftText.textContent = `Shift ${directions.fromColor.colorName} → ${directions.toColor.colorName}`;
      }
      if (els.wayfinderLandmarkText) {
        els.wayfinderLandmarkText.textContent = selectedFriend.note || directions.nearest.phrase || '';
      }
    }

    // 7. Share message preview
    const payload = getCurrentSharePayload();
    if (els.chatMessagePreview) {
      els.chatMessagePreview.textContent = payload.fullMessage;
    }
    if (els.chatPreviewCount) {
      els.chatPreviewCount.textContent = `CREW: ${payload.stateObj.pins.length} PINS`;
    }

    // Re-render canvas and sync HTML overlay
    renderCanvas();
    syncOverlay();
  }

  /**
   * Wire Event Listeners
   */
  function initListeners() {
    // 1. Header Event Name Editing
    if (els.eventBadgeBtn) {
      els.eventBadgeBtn.addEventListener('click', () => {
        const next = prompt('Enter Festival or Event Name:', state.eventName);
        if (next && next.trim()) {
          state.eventName = next.trim();
          try { localStorage.setItem(STORAGE_KEY_EVENT, state.eventName); } catch (_) {}
          updateAll();
          showToast(`Event name updated to "${state.eventName}"`);
        }
      });
    }

    // Demo crew toggle
    if (els.btnDemoCrew) {
      els.btnDemoCrew.addEventListener('click', () => {
        state.demoCrewActive = !state.demoCrewActive;
        if (state.demoCrewActive) {
          state.pins = createDemoCrew();
          showToast('Demo crew loaded on floor');
        } else {
          state.pins = [];
          showToast('Demo crew cleared');
        }
        updateAll();
      });
    }

    // Theme toggle
    if (els.btnThemeToggle) {
      els.btnThemeToggle.addEventListener('click', () => {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        const nextTheme = isLight ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', nextTheme);
        els.btnThemeToggle.textContent = nextTheme === 'light' ? '🌙' : '☀️';
        try { localStorage.setItem('chromafloor_theme', nextTheme); } catch (_) {}
        updateAll();
      });
    }

    // 2. Add Room Modal
    if (els.btnAddRoom && els.addRoomModal) {
      els.btnAddRoom.addEventListener('click', () => {
        els.addRoomModal.classList.remove('hidden');
      });
    }
    if (els.btnCancelRoom && els.addRoomModal) {
      els.btnCancelRoom.addEventListener('click', () => {
        els.addRoomModal.classList.add('hidden');
      });
    }
    if (els.btnSaveRoom && els.addRoomModal) {
      els.btnSaveRoom.addEventListener('click', () => {
        const name = (els.newRoomName?.value || '').trim();
        const width = parseInt(els.newRoomWidth?.value, 10) || 50;
        const depth = parseInt(els.newRoomDepth?.value, 10) || 50;
        const shape = els.newRoomShape?.value || 'stage';

        if (!name) {
          alert('Please enter a room name');
          return;
        }

        const id = 'custom-' + Date.now().toString(36);
        const newRoom = {
          id,
          name,
          shape,
          widthMeters: width,
          depthMeters: depth,
          landmarks: [
            { id: `${id}-dj`, name: 'DJ Booth', icon: '🎧', type: 'speaker', x: 0.50, y: 0.12 },
            { id: `${id}-bar`, name: 'Bar', icon: '🍸', type: 'bar', x: 0.15, y: 0.55 },
            { id: `${id}-arch`, name: 'Entrance', icon: '🚪', type: 'entrance', x: 0.50, y: 0.92 }
          ]
        };

        state.customRooms.push(newRoom);
        try { localStorage.setItem(STORAGE_KEY_CUSTOM_ROOMS, JSON.stringify(state.customRooms)); } catch (_) {}

        state.activeRoomId = id;
        els.addRoomModal.classList.add('hidden');
        if (els.newRoomName) els.newRoomName.value = '';
        cachedFloorCanvas = null;
        updateAll();
        showToast(`Created venue room "${name}"`);
      });
    }

    // 3. Stage Viewport Controls
    if (els.btnFlipView) {
      els.btnFlipView.addEventListener('click', () => {
        state.flipped = !state.flipped;
        cachedFloorCanvas = null;
        updateAll();
        showToast(state.flipped ? 'Flipped perspective 180°' : 'Reset perspective to Stage front');
      });
    }

    if (els.btnToggleGrid) {
      els.btnToggleGrid.addEventListener('click', () => {
        state.showGrid = !state.showGrid;
        els.btnToggleGrid.classList.toggle('bg-amber-500/20', state.showGrid);
        updateAll();
      });
    }

    // Pointer and Drag Interaction on Viewport
    let isDragging = false;
    const viewport = els.mapViewport || els.floorCanvas;

    if (viewport) {
      viewport.addEventListener('pointerdown', (e) => {
        const hitCrew = handlePointer(e.clientX, e.clientY, true);
        if (!hitCrew) {
          isDragging = true;
          try { viewport.setPointerCapture(e.pointerId); } catch (_) {}
        }
      });

      viewport.addEventListener('pointermove', (e) => {
        if (isDragging) {
          handlePointer(e.clientX, e.clientY, false);
        }
      });

      viewport.addEventListener('pointerup', (e) => {
        if (isDragging) {
          isDragging = false;
          try { viewport.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      });

      viewport.addEventListener('pointercancel', () => {
        isDragging = false;
      });
    }

    // 4. GPS Assist
    function requestGps() {
      if (!('geolocation' in navigator)) {
        showToast('GPS geolocation not supported on this device', true);
        if (els.gpsStatusText) els.gpsStatusText.textContent = 'GPS not supported';
        return;
      }
      if (els.gpsStatusText) els.gpsStatusText.textContent = 'Acquiring GPS fix...';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          state.gpsActive = true;
          state.gpsCoords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy
          };
          if (els.attachGpsCheckbox) els.attachGpsCheckbox.checked = true;
          if (els.gpsStatusText) {
            els.gpsStatusText.textContent = `GPS: ±${Math.round(pos.coords.accuracy)}m (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`;
          }
          showToast(`GPS coordinates locked (±${Math.round(pos.coords.accuracy)}m)`);
          updateAll();
        },
        (err) => {
          state.gpsActive = false;
          state.gpsCoords = null;
          if (els.attachGpsCheckbox) els.attachGpsCheckbox.checked = false;
          if (els.gpsStatusText) els.gpsStatusText.textContent = 'GPS permission denied or unavailable';
          showToast('Could not acquire GPS: permission denied or unavailable', true);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    }

    if (els.btnGpsAssist) {
      els.btnGpsAssist.addEventListener('click', requestGps);
    }
    if (els.attachGpsCheckbox) {
      els.attachGpsCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) requestGps();
        else {
          state.gpsActive = false;
          state.gpsCoords = null;
          if (els.gpsStatusText) els.gpsStatusText.textContent = 'GPS unattached';
          updateAll();
        }
      });
    }

    // 5. Note Chips & Inputs
    if (els.userNameInput) {
      els.userNameInput.addEventListener('input', () => {
        state.userName = els.userNameInput.value.trim() || 'You';
        try { localStorage.setItem(STORAGE_KEY_USER_NAME, state.userName); } catch (_) {}
        updateAll();
      });
    }

    if (els.userNoteInput) {
      els.userNoteInput.addEventListener('input', () => {
        state.userNote = els.userNoteInput.value.trim();
        updateAll();
      });
    }

    if (els.notePresetChips) {
      els.notePresetChips.querySelectorAll('.chip-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const text = btn.getAttribute('data-note') || btn.textContent.trim();
          if (els.userNoteInput) {
            els.userNoteInput.value = text;
            state.userNote = text;
            updateAll();
          }
        });
      });
    }

    if (els.includeCrewCheckbox) {
      els.includeCrewCheckbox.addEventListener('change', (e) => {
        state.includeCrewInShare = e.target.checked;
        updateAll();
      });
    }

    // 6. Pin Drop & Sharing
    if (els.btnDropShare) {
      els.btnDropShare.addEventListener('click', async () => {
        state.userDropped = true;
        state.userSpot = {
          x: state.draftSpot.x,
          y: state.draftSpot.y,
          roomId: state.activeRoomId
        };

        try {
          localStorage.setItem(STORAGE_KEY_SAVED_SPOT, JSON.stringify(state.userSpot));
        } catch (_) {}

        const payload = getCurrentSharePayload();

        // Update URL hash without reload
        const hash = UrlState.encodeState(payload.stateObj);
        window.history.replaceState(null, '', hash);

        // Share native or clipboard fallback
        if (navigator.share && /mobile|android|iphone|ipad/i.test(navigator.userAgent)) {
          try {
            await navigator.share({
              title: `${state.userName}'s ChromaFloor Spot`,
              text: payload.fullMessage
            });
            showToast('✓ Shared via system dialog!');
          } catch (err) {
            if (err.name !== 'AbortError') {
              await copyToClipboard(payload.fullMessage);
              showToast('✓ Pin dropped & group chat message copied!');
            }
          }
        } else {
          await copyToClipboard(payload.fullMessage);
          showToast('✓ Pin dropped & link copied to clipboard!');
        }

        updateAll();
      });
    }

    if (els.btnCopyLink) {
      els.btnCopyLink.addEventListener('click', async () => {
        const payload = getCurrentSharePayload();
        const hash = UrlState.encodeState(payload.stateObj);
        window.history.replaceState(null, '', hash);

        await copyToClipboard(payload.shareUrl);
        showToast('✓ Copied radar link only!');
      });
    }

    // Direct Group Chat Share Buttons
    async function copyToClipboard(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        return true;
      }
    }

    if (els.btnShareNative) {
      els.btnShareNative.addEventListener('click', async () => {
        const payload = getCurrentSharePayload();
        if (navigator.share) {
          try {
            await navigator.share({ title: 'ChromaFloor Radar', text: payload.fullMessage });
            showToast('✓ Shared!');
            return;
          } catch (_) {}
        }
        await copyToClipboard(payload.fullMessage);
        showToast('✓ Copied message + link!');
      });
    }

    if (els.btnShareWhatsapp) {
      els.btnShareWhatsapp.addEventListener('click', () => {
        const payload = getCurrentSharePayload();
        const url = `https://wa.me/?text=${encodeURIComponent(payload.fullMessage)}`;
        window.open(url, '_blank');
      });
    }

    if (els.btnShareTelegram) {
      els.btnShareTelegram.addEventListener('click', () => {
        const payload = getCurrentSharePayload();
        const url = `https://t.me/share/url?url=${encodeURIComponent(payload.shareUrl)}&text=${encodeURIComponent(payload.previewText)}`;
        window.open(url, '_blank');
      });
    }

    if (els.btnShareSms) {
      els.btnShareSms.addEventListener('click', () => {
        const payload = getCurrentSharePayload();
        const separator = /iphone|ipad/i.test(navigator.userAgent) ? '&' : '?';
        window.location.href = `sms:${separator}body=${encodeURIComponent(payload.fullMessage)}`;
      });
    }

    if (els.btnCopyMessage) {
      els.btnCopyMessage.addEventListener('click', async () => {
        const payload = getCurrentSharePayload();
        await copyToClipboard(payload.fullMessage);
        showToast('✓ Copied full group chat message!');
      });
    }

    // 7. Walk Simulator
    if (els.btnWalkSim) {
      els.btnWalkSim.addEventListener('click', () => {
        if (state.walkingSimActive) {
          clearInterval(state.walkingSimTimer);
          state.walkingSimActive = false;
          els.btnWalkSim.textContent = 'Walk Sim';
          showToast('Walk simulation stopped');
          return;
        }

        const target = state.pins.find(p => p.id === state.selectedCrewId && p.roomId === state.activeRoomId)
          || { x: 0.38, y: 0.28 };

        state.walkingSimActive = true;
        els.btnWalkSim.textContent = 'Stop Sim';
        showToast('Simulating walk from Main Arch entrance...');

        const startX = 0.50;
        const startY = 0.92;
        let progress = 0;

        state.walkingSimTimer = setInterval(() => {
          progress += 0.035;
          if (progress >= 1) {
            clearInterval(state.walkingSimTimer);
            state.walkingSimActive = false;
            els.btnWalkSim.textContent = 'Walk Sim';
            progress = 1;
            showToast(`Arrived at ${target.name || 'Friend'}!`);
          }
          state.draftSpot = {
            x: startX + progress * (target.x - startX),
            y: startY + progress * (target.y - startY)
          };
          updateAll();
        }, 75);
      });
    }

    // 8. Color Beacon Modal
    if (els.btnFlashBeacon && els.beaconModal) {
      els.btnFlashBeacon.addEventListener('click', () => {
        const dColor = ColorEngine.getSpotColor(state.draftSpot.x, state.draftSpot.y);
        const room = getActiveRoom();
        const nearest = ColorEngine.getNearestLandmark(state.draftSpot.x, state.draftSpot.y, room);

        if (els.beaconModal) {
          els.beaconModal.style.backgroundColor = dColor.hex;
          els.beaconModal.style.color = dColor.textColor;
          els.beaconModal.classList.remove('hidden');
        }
        if (els.beaconRoomLabel) els.beaconRoomLabel.textContent = room.name;
        if (els.beaconZoneCode) els.beaconZoneCode.textContent = dColor.zoneCode;
        if (els.beaconColorTitle) els.beaconColorTitle.textContent = dColor.colorName;
        if (els.beaconHexCode) els.beaconHexCode.textContent = dColor.hex;
        if (els.beaconUserMeta) {
          const safeName = (els.userNameInput ? els.userNameInput.value.trim() : state.userName) || 'You';
          els.beaconUserMeta.textContent = `${safeName} · ${nearest.phrase || dColor.fullPositionLabel}`;
        }

        state.beaconOpen = true;
      });
    }

    if (els.beaconCloseBtn && els.beaconModal) {
      els.beaconCloseBtn.addEventListener('click', () => {
        els.beaconModal.classList.add('hidden');
        state.beaconOpen = false;
        if (state.beaconPulsing && els.beaconPulseBtn) {
          state.beaconPulsing = false;
          els.beaconPulseBtn.textContent = 'Pulse: OFF';
          els.beaconModal.classList.remove('animate-pulse');
        }
      });
    }

    if (els.beaconPulseBtn && els.beaconModal) {
      els.beaconPulseBtn.addEventListener('click', () => {
        state.beaconPulsing = !state.beaconPulsing;
        els.beaconPulseBtn.textContent = `Pulse: ${state.beaconPulsing ? 'ON' : 'OFF'}`;
        els.beaconModal.classList.toggle('animate-pulse', state.beaconPulsing);
      });
    }

    // Escape key closes beacon or modal
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (state.beaconOpen && els.beaconModal) {
          els.beaconModal.classList.add('hidden');
          state.beaconOpen = false;
        }
        if (els.addRoomModal && !els.addRoomModal.classList.contains('hidden')) {
          els.addRoomModal.classList.add('hidden');
        }
      }
    });

    // Window resize observer for high-DPI canvas
    window.addEventListener('resize', () => {
      syncCanvasDimensions();
      updateAll();
    });
  }

  /**
   * Resizes internal canvas dimensions to match CSS display width at device pixel ratio
   */
  function syncCanvasDimensions() {
    if (!els.floorCanvas) return;
    const canvas = els.floorCanvas;
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const targetW = Math.round(rect.width * dpr);
      const targetH = Math.round(rect.height * dpr);

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        cachedFloorCanvas = null;
      }
    }
  }

  /**
   * Hydrates state from #cf1= URL hash
   */
  function hydrateFromHash() {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#cf1=')) return;

    const parsed = UrlState.decodeHash(hash);
    if (!parsed) return;

    if (parsed.eventName) state.eventName = parsed.eventName;
    if (parsed.activeRoomId) state.activeRoomId = parsed.activeRoomId;

    if (Array.isArray(parsed.pins) && parsed.pins.length > 0) {
      // Incoming friends
      state.pins = parsed.pins;

      // If a focus pin was specified, select it
      if (parsed.focusPinId) {
        const focused = parsed.pins.find(p => p.id === parsed.focusPinId);
        if (focused) {
          state.selectedCrewId = focused.id;
          state.activeRoomId = focused.roomId || state.activeRoomId;
          showToast(`📍 Locked on ${focused.name}'s spot (${focused.colorName || 'Zone'})!`);
        }
      } else {
        showToast(`📍 Loaded ${parsed.pins.length} crew pins from link!`);
      }
    }

    cachedFloorCanvas = null;
    updateAll();
  }

  /**
   * Register Service Worker cleanly
   */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => {
            console.log('[ChromaFloor] ServiceWorker registered with scope:', reg.scope);
          })
          .catch(err => {
            console.info('[ChromaFloor] ServiceWorker registration skipped or failed:', err);
          });
      });
    }
  }

  /**
   * Continuous animation loop for sightline dashing and pulse effects
   */
  function startAnimationLoop() {
    function tick() {
      if (!state.beaconOpen) {
        renderCanvas();
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /**
   * Bootstrap
   */
  function init() {
    syncCanvasDimensions();
    initListeners();
    hydrateFromHash();

    window.addEventListener('hashchange', hydrateFromHash);

    // Restore saved theme
    try {
      const savedTheme = localStorage.getItem('chromafloor_theme');
      if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        if (els.btnThemeToggle) els.btnThemeToggle.textContent = savedTheme === 'light' ? '🌙' : '☀️';
      }
    } catch (_) {}

    // Initial render
    updateAll();
    startAnimationLoop();
    registerServiceWorker();

    console.log('[ChromaFloor] App Controller initialized successfully.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
