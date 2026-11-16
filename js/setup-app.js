/**
 * ChromaFloor - Venue Setup Studio Controller (setup.html)
 * Comprehensive visual floorplan and venue editor:
 * Room configuration (name, dimensions, palette: wheel/polar/prism),
 * fixture catalog with drag-and-drop & tap-to-place,
 * landmark inspector, and one-click guest link export.
 */
(function() {
  'use strict';

  const ColorEngine = window.ChromaColorEngine;
  const UrlState = window.ChromaUrlState;

  if (!ColorEngine || !UrlState) {
    console.error('[ChromaFloor] ChromaColorEngine and ChromaUrlState must be loaded before setup-app.js');
    return;
  }

  // Storage Keys (Shared with share-app.js)
  const STORAGE_KEY_EVENT = 'chromafloor_event_v3';
  const STORAGE_KEY_ROOMS = 'chromafloor_rooms_v3';
  const STORAGE_KEY_THEME = 'chromafloor_theme_v2';

  // Application State
  const state = {
    eventName: ColorEngine.DEFAULT_EVENT_NAME || 'BangFace',
    activeRoomId: 'main',
    rooms: JSON.parse(JSON.stringify(ColorEngine.DEFAULT_ROOMS)),
    flipped: false,
    showGrid: true,
    snapToGrid: false,
    armedEmoji: null,
    armedType: null,
    selectedFixtureId: null
  };

  // Helper: Element getter by primary ID or fallback ID
  function getEl(primaryId, fallbackId) {
    return document.getElementById(primaryId) || (fallbackId ? document.getElementById(fallbackId) : null);
  }

  // DOM Elements
  const els = {
    setupEventName: getEl('setup-event-name', 'event-name-label'),
    btnCopyGuestLink: getEl('btn-copy-guest-link', 'btn-share-venue'),
    btnSetupQr: getEl('btn-setup-qr'),
    qrModal: getEl('qr-modal'),
    qrModalTitle: getEl('qr-modal-title'),
    qrSvgWrap: getEl('qr-svg-wrap'),
    qrSpotSummary: getEl('qr-spot-summary'),
    qrLiveText: getEl('qr-live-text'),
    btnCloseQr: getEl('btn-close-qr'),
    btnQrCopy: getEl('btn-qr-copy'),
    btnQrDone: getEl('btn-qr-done'),
    linkOpenSharing: getEl('link-open-sharing'),
    btnThemeToggle: getEl('btn-theme-toggle'),

    setupRoomTabs: getEl('setup-room-tabs', 'room-tabs'),
    btnAddRoom: getEl('btn-add-room'),

    // Add Room Modal
    addRoomModal: getEl('add-room-modal'),
    newRoomName: getEl('new-room-name'),
    newRoomWidth: getEl('new-room-width'),
    newRoomDepth: getEl('new-room-depth'),
    newRoomTemplate: getEl('new-room-template'),
    newRoomPalette: getEl('new-room-palette', 'new-room-shape'),
    btnCancelRoom: getEl('btn-cancel-room'),
    btnSaveRoom: getEl('btn-save-room'),

    // Active Room Config Editor
    editorRoomName: getEl('editor-room-name'),
    editorRoomWidth: getEl('editor-room-width'),
    editorRoomDepth: getEl('editor-room-depth'),
    editorRoomPalette: getEl('editor-room-palette'),
    btnClearLandmarks: getEl('btn-clear-landmarks', 'btn-editor-clear-landmarks'),
    btnDeleteRoom: getEl('btn-delete-room', 'btn-editor-delete-room'),

    // Stage Required Banner & Actions
    stageRequiredBanner: getEl('stage-required-banner'),
    btnPlaceStage: getEl('btn-place-stage'),

    // Fixture & Emoji Palette
    fixturePalette: getEl('fixture-palette'),
    customEmojiInput: getEl('custom-emoji-input'),
    customLabelInput: getEl('custom-label-input'),
    editorModeHint: getEl('editor-mode-hint'),

    // Selected Fixture Inspector
    selectedFixtureBar: getEl('selected-fixture-bar'),
    stageInspectorView: getEl('stage-inspector-view'),
    emojiInspectorView: getEl('emoji-inspector-view'),
    selectedStageName: getEl('selected-stage-name'),
    selectedStagePos: getEl('selected-stage-pos'),
    selectedFixtureEmoji: getEl('selected-fixture-emoji'),
    selectedFixtureName: getEl('selected-fixture-name'),
    selectedFixturePos: getEl('selected-fixture-pos'),
    btnDeleteFixture: getEl('btn-delete-fixture'),

    // Setup Map Canvas & Overlay
    setupMapViewport: getEl('setup-map-viewport', 'map-viewport'),
    setupFloorCanvas: getEl('setup-floor-canvas', 'floor-canvas'),
    setupMapOverlay: getEl('setup-map-overlay', 'map-overlay'),
    btnSetupFlip: getEl('btn-setup-flip', 'btn-flip-view'),
    btnSetupGrid: getEl('btn-setup-grid', 'btn-toggle-grid'),
    chkSetupSnap: getEl('chk-setup-snap', 'btn-editor-snap-grid'),
    setupOrientationLabel: getEl('setup-orientation-label', 'orientation-label'),
    setupDimensionsLabel: getEl('setup-dimensions-label', 'room-dimensions-label'),
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
   * Retreives active room
   */
  function getActiveRoom() {
    return state.rooms.find(r => r.id === state.activeRoomId) || state.rooms[0] || ColorEngine.DEFAULT_ROOMS[0];
  }

  /**
   * Persists state to localStorage and updates URL hash
   */
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY_EVENT, state.eventName);
      localStorage.setItem(STORAGE_KEY_ROOMS, JSON.stringify(state.rooms));
    } catch (e) {
      console.warn('[setup-app] LocalStorage save error:', e);
    }

    // Sync URL hash
    const hash = UrlState.encodeState({
      eventName: state.eventName,
      activeRoomId: state.activeRoomId,
      rooms: state.rooms,
      pins: []
    });
    window.history.replaceState(null, '', hash);
    updateGuestLinks();
  }

  /**
   * Updates guest link buttons/hrefs
   */
  function updateGuestLinks() {
    const guestUrl = UrlState.buildShareUrl({
      eventName: state.eventName,
      activeRoomId: state.activeRoomId,
      rooms: state.rooms,
      pins: []
    });

    if (els.linkOpenSharing) {
      if (els.linkOpenSharing.tagName.toLowerCase() === 'a') {
        els.linkOpenSharing.href = guestUrl;
      } else {
        els.linkOpenSharing.onclick = () => { window.location.href = guestUrl; };
      }
    }
  }

  /**
   * Loads initial state from localStorage & URL hash (#cf1=)
   */
  function initData() {
    try {
      const savedEvent = localStorage.getItem(STORAGE_KEY_EVENT);
      if (savedEvent) state.eventName = savedEvent;

      const savedRooms = localStorage.getItem(STORAGE_KEY_ROOMS);
      if (savedRooms) {
        const parsed = JSON.parse(savedRooms);
        if (Array.isArray(parsed) && parsed.length > 0) state.rooms = parsed;
      }

      const savedTheme = localStorage.getItem(STORAGE_KEY_THEME);
      if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
      }
    } catch (e) {
      console.warn('[setup-app] LocalStorage read error:', e);
    }

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
      }
    }
  }

  /**
   * Populates room editor controls with active room data
   */
  function syncRoomEditorFields() {
    const room = getActiveRoom();
    if (!room) return;

    if (els.setupEventName) {
      if (els.setupEventName.tagName.toLowerCase() === 'input') {
        els.setupEventName.value = state.eventName;
      } else {
        els.setupEventName.textContent = state.eventName;
      }
    }

    if (els.editorRoomName) els.editorRoomName.value = room.name || '';
    if (els.editorRoomWidth) els.editorRoomWidth.value = room.widthMeters || 40;
    if (els.editorRoomDepth) els.editorRoomDepth.value = room.depthMeters || 50;
    if (els.editorRoomPalette) els.editorRoomPalette.value = room.palette || 'wheel';

    if (els.setupDimensionsLabel) {
      els.setupDimensionsLabel.textContent = `${room.widthMeters || 40}M × ${room.depthMeters || 50}M`;
    }

    updateOrientationLabel();
  }

  function updateOrientationLabel() {
    if (!els.setupOrientationLabel) return;
    const room = getActiveRoom();
    const stage = ColorEngine.getStageOrigin(room);
    if (stage.hasStage) {
      els.setupOrientationLabel.textContent = state.flipped
        ? `FACING AWAY FROM ${stage.name.toUpperCase()} ↓`
        : `FACING ${stage.name.toUpperCase()} ↑`;
    } else {
      els.setupOrientationLabel.textContent = state.flipped ? 'STAGE BEHIND YOU ↓' : 'FACING STAGE ↑';
    }
  }

  /**
   * Renders room tabs
   */
  function renderRoomTabs() {
    if (!els.setupRoomTabs) return;
    els.setupRoomTabs.innerHTML = '';

    state.rooms.forEach(room => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `room-tab ${room.id === state.activeRoomId ? 'active' : ''}`;
      tab.textContent = room.name;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', room.id === state.activeRoomId ? 'true' : 'false');
      tab.addEventListener('click', () => {
        state.activeRoomId = room.id;
        state.selectedFixtureId = null;
        renderRoomTabs();
        syncRoomEditorFields();
        renderCanvas();
        renderOverlay();
        syncSelectedFixtureInspector();
        persist();
      });
      els.setupRoomTabs.appendChild(tab);
    });
  }

  /**
   * Renders Floor Canvas
   */
  function renderCanvas() {
    if (!els.setupFloorCanvas || !els.setupMapViewport) return;
    const room = getActiveRoom();
    const palette = room.palette || 'wheel';

    const rect = els.setupMapViewport.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.round(rect.width) || 400;
    const displayHeight = Math.round(rect.height) || displayWidth;

    els.setupFloorCanvas.width = displayWidth * dpr;
    els.setupFloorCanvas.height = displayHeight * dpr;

    const ctx = els.setupFloorCanvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const bg = ColorEngine.createFloorBackground(displayWidth, displayHeight, state.flipped, room.shape, palette);
    ctx.drawImage(bg, 0, 0, displayWidth, displayHeight);

    ColorEngine.drawWheelGuides(ctx, displayWidth, displayHeight, {
      showGrid: state.showGrid,
      palette
    });
  }

  /**
   * Syncs stage banner visibility based on active room's landmarks
   */
  function syncStageBanner() {
    if (!els.stageRequiredBanner) return;
    const room = getActiveRoom();
    const hasStage = Boolean(room && Array.isArray(room.landmarks) && room.landmarks.some(l => l.type === 'stage'));
    if (hasStage) {
      els.stageRequiredBanner.classList.add('hidden');
    } else {
      els.stageRequiredBanner.classList.remove('hidden');
    }
  }

  /**
   * Updates fixture inspector bar
   */
  function syncSelectedFixtureInspector() {
    if (!els.selectedFixtureBar) return;
    const room = getActiveRoom();
    const fixtures = Array.isArray(room.landmarks) ? room.landmarks : [];
    const selected = fixtures.find(f => f.id === state.selectedFixtureId);

    if (!selected) {
      els.selectedFixtureBar.classList.add('hidden');
      return;
    }

    els.selectedFixtureBar.classList.remove('hidden');
    const isStage = (selected.type === 'stage');

    const colLetter = ColorEngine.ZONE_COLUMNS[Math.min(7, Math.floor(selected.x * 8))];
    const rowNumber = Math.min(8, Math.floor(selected.y * 8) + 1);
    const posText = `Zone ${colLetter}${rowNumber}`;

    if (isStage) {
      if (els.stageInspectorView) els.stageInspectorView.classList.remove('hidden');
      if (els.emojiInspectorView) els.emojiInspectorView.classList.add('hidden');
      if (els.selectedStageName) els.selectedStageName.value = selected.name || 'Stage';
      if (els.selectedStagePos) els.selectedStagePos.textContent = posText;
    } else {
      if (els.stageInspectorView) els.stageInspectorView.classList.add('hidden');
      if (els.emojiInspectorView) els.emojiInspectorView.classList.remove('hidden');
      if (els.selectedFixtureEmoji) els.selectedFixtureEmoji.value = selected.icon || '📍';
      if (els.selectedFixtureName) els.selectedFixtureName.value = selected.name || '';
      if (els.selectedFixturePos) els.selectedFixturePos.textContent = posText;
    }
  }

  /**
   * Renders placed fixtures on overlay
   */
  function renderOverlay() {
    if (!els.setupMapOverlay) return;
    els.setupMapOverlay.innerHTML = '';

    const room = getActiveRoom();
    const landmarks = Array.isArray(room.landmarks) ? room.landmarks : [];

    landmarks.forEach(lm => {
      const rawDispX = state.flipped ? (1 - lm.x) : lm.x;
      const rawDispY = state.flipped ? (1 - lm.y) : lm.y;
      const isStage = (lm.type === 'stage');
      const dispX = isStage
        ? Math.max(0.16, Math.min(0.84, rawDispX))
        : Math.max(0.07, Math.min(0.93, rawDispX));
      const dispY = Math.max(0.065, Math.min(0.935, rawDispY));
      const isSelected = lm.id === state.selectedFixtureId;
      const hasLabel = Boolean(lm.name && lm.name.trim().length > 0);
      const isPureEmoji = !isStage && !hasLabel;

      const pill = document.createElement('div');
      pill.className = `landmark-pill editable landmark-${lm.type || 'custom'}${isSelected ? ' selected-fixture' : ''}${isPureEmoji ? ' pure-emoji' : ''}`;
      pill.style.left = `${dispX * 100}%`;
      pill.style.top = `${dispY * 100}%`;
      pill.dataset.fixtureId = lm.id;
      pill.dataset.type = lm.type || 'custom';

      const emojiHtml = `<span class="lm-emoji${isPureEmoji ? ' standalone' : ''}">${lm.icon || (isStage ? '🎸' : '📍')}</span>`;
      const labelHtml = (isStage || hasLabel) ? `<span class="lm-text">${lm.name || (isStage ? 'STAGE' : '')}</span>` : '';
      pill.innerHTML = `${emojiHtml}${labelHtml}`;

      // 60fps Drag-and-drop handler for placed landmarks
      setupLandmarkDragging(pill, lm);

      els.setupMapOverlay.appendChild(pill);
    });

    syncStageBanner();
  }

  /**
   * Direct pointer-captured dragging of a placed landmark pill
   */
  function setupLandmarkDragging(pillEl, lm) {
    let dragging = false;
    let didMove = false;
    let startX = 0, startY = 0;

    pillEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dragging = true;
      didMove = false;
      startX = e.clientX;
      startY = e.clientY;

      state.selectedFixtureId = lm.id;
      renderOverlay();
      syncSelectedFixtureInspector();

      try {
        pillEl.setPointerCapture(e.pointerId);
      } catch (_) {}
    });

    pillEl.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (dist > 3) {
        didMove = true;
        pillEl.classList.add('dragging');
      }

      const rect = els.setupMapViewport.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      let normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      let normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      if (state.flipped) {
        normX = 1 - normX;
        normY = 1 - normY;
      }

      if (state.snapToGrid) {
        normX = Math.round(normX * 8) / 8;
        normY = Math.round(normY * 8) / 8;
      }

      lm.x = normX;
      lm.y = normY;

      // Update position on overlay with edge-safe display clamping
      const rawDispX = state.flipped ? (1 - lm.x) : lm.x;
      const rawDispY = state.flipped ? (1 - lm.y) : lm.y;
      const isStage = (lm.type === 'stage');
      const dispX = isStage
        ? Math.max(0.16, Math.min(0.84, rawDispX))
        : Math.max(0.07, Math.min(0.93, rawDispX));
      const dispY = Math.max(0.065, Math.min(0.935, rawDispY));
      pillEl.style.left = `${dispX * 100}%`;
      pillEl.style.top = `${dispY * 100}%`;

      syncSelectedFixtureInspector();
    });

    function finishDrag(e) {
      if (!dragging) return;
      dragging = false;
      pillEl.classList.remove('dragging');
      try {
        pillEl.releasePointerCapture(e.pointerId);
      } catch (_) {}
      persist();
      renderOverlay();
      syncSelectedFixtureInspector();
      updateOrientationLabel();
    }

    pillEl.addEventListener('pointerup', finishDrag);
    pillEl.addEventListener('pointercancel', finishDrag);
  }

  /**
   * Interactive floor tap to place armed emoji marker
   */
  function setupViewportInteractions() {
    if (!els.setupMapViewport) return;

    els.setupMapViewport.addEventListener('click', (e) => {
      // If clicking directly on a landmark or button, ignore
      if (e.target.closest('.landmark-pill') || e.target.closest('button')) return;

      const room = getActiveRoom();
      if (!state.armedEmoji) {
        // Deselect current fixture if any
        if (state.selectedFixtureId) {
          state.selectedFixtureId = null;
          renderOverlay();
          syncSelectedFixtureInspector();
        }
        return;
      }

      // Place armed emoji marker
      const rect = els.setupMapViewport.getBoundingClientRect();
      let normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      let normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

      if (state.flipped) {
        normX = 1 - normX;
        normY = 1 - normY;
      }

      if (state.snapToGrid) {
        normX = Math.round(normX * 8) / 8;
        normY = Math.round(normY * 8) / 8;
      }

      const emoji = state.armedEmoji || '📍';
      const labelText = (els.customLabelInput && els.customLabelInput.value.trim()) || '';
      const isStage = (state.armedType === 'stage');

      const newFixture = {
        id: `lm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name: isStage ? (labelText || 'Stage') : labelText,
        type: isStage ? 'stage' : 'custom',
        icon: emoji,
        x: normX,
        y: normY
      };

      if (!Array.isArray(room.landmarks)) room.landmarks = [];
      room.landmarks.push(newFixture);
      state.selectedFixtureId = newFixture.id;
      state.armedEmoji = null; // disarm
      state.armedType = null;

      // Clear active chip styles
      document.querySelectorAll('.fixture-chip').forEach(c => c.classList.remove('armed'));
      if (els.editorModeHint) {
        els.editorModeHint.textContent = 'Drag any placed item to reposition — or tap an emoji below:';
      }

      persist();
      renderOverlay();
      syncSelectedFixtureInspector();
      updateOrientationLabel();
      showToast(`Placed ${newFixture.icon} ${newFixture.name}`.trim());
    });
  }

  /**
   * Curated quick-tap emoji palette & custom emoji/label inputs
   */
  function setupFixturePalette() {
    // 1. Prominent Place Stage Block button
    if (els.btnPlaceStage) {
      els.btnPlaceStage.addEventListener('click', () => {
        const room = getActiveRoom();
        if (!Array.isArray(room.landmarks)) room.landmarks = [];
        const existingStage = room.landmarks.find(l => l.type === 'stage');
        if (existingStage) {
          state.selectedFixtureId = existingStage.id;
          renderOverlay();
          syncSelectedFixtureInspector();
          showToast('Stage block is already placed in this room');
          return;
        }

        const newStage = {
          id: `lm-stage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          name: 'Stage',
          type: 'stage',
          icon: '🎸',
          x: 0.50,
          y: 0.08
        };
        room.landmarks.push(newStage);
        state.selectedFixtureId = newStage.id;

        persist();
        renderOverlay();
        syncSelectedFixtureInspector();
        updateOrientationLabel();
        showToast('Placed required Stage block');
      });
    }

    // 2. Curated quick emoji buttons
    if (els.fixturePalette) {
      els.fixturePalette.addEventListener('click', (e) => {
        const chip = e.target.closest('.fixture-chip');
        if (!chip) return;
        const emoji = chip.dataset.emoji;
        if (!emoji) return;

        if (state.armedEmoji === emoji) {
          // Disarm
          state.armedEmoji = null;
          state.armedType = null;
          chip.classList.remove('armed');
          if (els.editorModeHint) {
            els.editorModeHint.textContent = 'Tap an emoji below then tap the floor — or enter custom emoji:';
          }
        } else {
          // Arm
          state.armedEmoji = emoji;
          state.armedType = 'custom';
          document.querySelectorAll('.fixture-chip').forEach(c => c.classList.remove('armed'));
          chip.classList.add('armed');
          if (els.customEmojiInput) {
            els.customEmojiInput.value = emoji;
          }
          if (els.editorModeHint) {
            els.editorModeHint.textContent = `🎯 Tap anywhere on the floor to place ${emoji}:`;
          }
        }
      });

      // Double-click drops marker near floor center
      els.fixturePalette.addEventListener('dblclick', (e) => {
        const chip = e.target.closest('.fixture-chip');
        if (!chip) return;
        const emoji = chip.dataset.emoji;
        if (!emoji) return;

        const room = getActiveRoom();
        const labelText = (els.customLabelInput && els.customLabelInput.value.trim()) || '';
        const offset = (Math.random() - 0.5) * 0.16;
        const newFixture = {
          id: `lm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
          name: labelText,
          type: 'custom',
          icon: emoji,
          x: Math.max(0.08, Math.min(0.92, 0.50 + offset)),
          y: Math.max(0.08, Math.min(0.92, 0.50 + offset))
        };

        if (!Array.isArray(room.landmarks)) room.landmarks = [];
        room.landmarks.push(newFixture);
        state.selectedFixtureId = newFixture.id;
        state.armedEmoji = null;
        state.armedType = null;
        document.querySelectorAll('.fixture-chip').forEach(c => c.classList.remove('armed'));

        persist();
        renderOverlay();
        syncSelectedFixtureInspector();
        updateOrientationLabel();
        showToast(`Dropped ${newFixture.icon} ${newFixture.name}`.trim());
      });
    }

    // 3. Custom Emoji Input
    if (els.customEmojiInput) {
      els.customEmojiInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (val) {
          state.armedEmoji = val;
          state.armedType = 'custom';
          document.querySelectorAll('.fixture-chip').forEach(c => c.classList.remove('armed'));
          if (els.editorModeHint) {
            els.editorModeHint.textContent = `🎯 Tap anywhere on the floor to place ${val}:`;
          }
        } else {
          state.armedEmoji = null;
          state.armedType = null;
        }
      });
    }
  }

  /**
   * Fixture Inspector edit & remove
   */
  function setupInspectorActions() {
    // Stage Title edit
    if (els.selectedStageName) {
      els.selectedStageName.addEventListener('input', (e) => {
        const room = getActiveRoom();
        const f = (room.landmarks || []).find(l => l.id === state.selectedFixtureId);
        if (f && f.type === 'stage') {
          f.name = e.target.value.trim() || 'Stage';
          renderOverlay();
          persist();
          updateOrientationLabel();
        }
      });
    }

    // Emoji Marker Emoji edit
    if (els.selectedFixtureEmoji) {
      els.selectedFixtureEmoji.addEventListener('input', (e) => {
        const room = getActiveRoom();
        const f = (room.landmarks || []).find(l => l.id === state.selectedFixtureId);
        if (f && f.type !== 'stage') {
          f.icon = e.target.value.trim() || '📍';
          renderOverlay();
          persist();
        }
      });
    }

    // Emoji Marker Label edit (supports empty string for emoji only!)
    if (els.selectedFixtureName) {
      els.selectedFixtureName.addEventListener('input', (e) => {
        const room = getActiveRoom();
        const f = (room.landmarks || []).find(l => l.id === state.selectedFixtureId);
        if (f && f.type !== 'stage') {
          f.name = e.target.value.trim(); // preserves empty string ""!
          renderOverlay();
          persist();
        }
      });
    }

    // Delete Fixture action (prevents deleting required Stage block)
    if (els.btnDeleteFixture) {
      els.btnDeleteFixture.addEventListener('click', () => {
        const room = getActiveRoom();
        if (!room.landmarks) return;
        const target = room.landmarks.find(l => l.id === state.selectedFixtureId);
        if (target && target.type === 'stage') {
          showToast('Cannot delete required Stage block');
          return;
        }

        room.landmarks = room.landmarks.filter(l => l.id !== state.selectedFixtureId);
        state.selectedFixtureId = null;
        renderOverlay();
        syncSelectedFixtureInspector();
        updateOrientationLabel();
        persist();
        showToast('Removed marker');
      });
    }
  }

  /**
   * Room configuration inputs (Name, Width, Depth, Palette, Clear, Delete)
   */
  function setupRoomConfigInputs() {
    if (els.editorRoomName) {
      els.editorRoomName.addEventListener('input', (e) => {
        const room = getActiveRoom();
        room.name = e.target.value.trim() || 'Room';
        renderRoomTabs();
        persist();
      });
    }

    if (els.editorRoomWidth) {
      els.editorRoomWidth.addEventListener('change', (e) => {
        const room = getActiveRoom();
        room.widthMeters = Math.max(10, Math.min(500, parseInt(e.target.value, 10) || 40));
        syncRoomEditorFields();
        persist();
      });
    }

    if (els.editorRoomDepth) {
      els.editorRoomDepth.addEventListener('change', (e) => {
        const room = getActiveRoom();
        room.depthMeters = Math.max(10, Math.min(500, parseInt(e.target.value, 10) || 50));
        syncRoomEditorFields();
        persist();
      });
    }

    if (els.editorRoomPalette) {
      els.editorRoomPalette.addEventListener('change', (e) => {
        const room = getActiveRoom();
        room.palette = e.target.value || 'wheel';
        renderCanvas();
        persist();
        showToast(`Palette switched to ${room.palette}`);
      });
    }

    if (els.btnClearLandmarks) {
      els.btnClearLandmarks.addEventListener('click', () => {
        if (!confirm('Remove all emoji markers from this room? (The Stage block will be kept)')) return;
        const room = getActiveRoom();
        if (Array.isArray(room.landmarks)) {
          // Keep stage block, remove all other emoji markers
          room.landmarks = room.landmarks.filter(l => l.type === 'stage');
        }
        state.selectedFixtureId = null;
        renderOverlay();
        syncSelectedFixtureInspector();
        updateOrientationLabel();
        persist();
        showToast('Emoji markers cleared (Stage preserved)');
      });
    }

    if (els.btnDeleteRoom) {
      els.btnDeleteRoom.addEventListener('click', () => {
        if (state.rooms.length <= 1) {
          alert('You must keep at least one room.');
          return;
        }
        if (!confirm(`Delete room "${getActiveRoom().name}"?`)) return;
        state.rooms = state.rooms.filter(r => r.id !== state.activeRoomId);
        state.activeRoomId = state.rooms[0].id;
        state.selectedFixtureId = null;
        renderRoomTabs();
        syncRoomEditorFields();
        renderCanvas();
        renderOverlay();
        syncSelectedFixtureInspector();
        persist();
        showToast('Room deleted');
      });
    }

    // Event name editing
    if (els.setupEventName && els.setupEventName.tagName.toLowerCase() === 'input') {
      els.setupEventName.addEventListener('input', (e) => {
        state.eventName = e.target.value.trim() || ColorEngine.DEFAULT_EVENT_NAME || 'BangFace';
        persist();
      });
    }
  }

  /**
   * Add Room Modal Setup
   */
  function setupAddRoomModal() {
    if (!els.btnAddRoom || !els.addRoomModal) return;

    els.btnAddRoom.addEventListener('click', () => {
      els.addRoomModal.classList.remove('hidden');
      if (els.newRoomName) els.newRoomName.focus();
    });

    if (els.btnCancelRoom) {
      els.btnCancelRoom.addEventListener('click', () => {
        els.addRoomModal.classList.add('hidden');
      });
    }

    if (els.btnSaveRoom) {
      els.btnSaveRoom.addEventListener('click', () => {
        const name = (els.newRoomName && els.newRoomName.value.trim()) || 'New Room';
        const width = (els.newRoomWidth && parseInt(els.newRoomWidth.value, 10)) || 40;
        const depth = (els.newRoomDepth && parseInt(els.newRoomDepth.value, 10)) || 50;
        const template = (els.newRoomTemplate && els.newRoomTemplate.value) || 'club';
        const palette = (els.newRoomPalette && els.newRoomPalette.value) || 'wheel';

        const newRoom = ColorEngine.buildRoomFromTemplate(template, {
          name,
          widthMeters: width,
          depthMeters: depth,
          palette
        });

        state.rooms.push(newRoom);
        state.activeRoomId = newRoom.id;
        state.selectedFixtureId = null;

        els.addRoomModal.classList.add('hidden');
        renderRoomTabs();
        syncRoomEditorFields();
        renderCanvas();
        renderOverlay();
        syncSelectedFixtureInspector();
        persist();
        showToast(`Created ${newRoom.name}`);
      });
    }
  }

  /**
   * Copy Guest Link Action (points to index.html Sharing UI!)
   */
  function setupCopyGuestLink() {
    if (!els.btnCopyGuestLink) return;

    els.btnCopyGuestLink.addEventListener('click', async () => {
      const shareUrl = UrlState.buildShareUrl({
        eventName: state.eventName,
        activeRoomId: state.activeRoomId,
        rooms: state.rooms,
        pins: []
      });

      let copied = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(shareUrl);
          copied = true;
        }
      } catch (err) {
        console.warn('[setup-app] Clipboard copy failed:', err);
      }

      showToast(copied ? '✓ Copied guest sharing link!' : 'Guest link ready in URL bar!');
    });
  }

  /**
   * Map tools: Flip, Grid, Snap
   */
  function setupMapTools() {
    if (els.btnSetupFlip) {
      els.btnSetupFlip.addEventListener('click', () => {
        state.flipped = !state.flipped;
        updateOrientationLabel();
        renderCanvas();
        renderOverlay();
      });
    }

    if (els.btnSetupGrid) {
      els.btnSetupGrid.addEventListener('click', () => {
        state.showGrid = !state.showGrid;
        els.btnSetupGrid.classList.toggle('active', state.showGrid);
        renderCanvas();
      });
    }

    if (els.chkSetupSnap) {
      els.chkSetupSnap.addEventListener('change', (e) => {
        state.snapToGrid = Boolean(e.target.checked);
      });
    }

    if (els.btnThemeToggle) {
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
  }

  /**
   * Venue Layout QR Modal Action
   */
  function setupVenueQR() {
    if (!els.btnSetupQr || !els.qrModal) return;

    let activeShareUrl = '';

    function closeQr() {
      if (els.qrModal) els.qrModal.classList.add('hidden');
    }

    function openQr() {
      const activeRoom = getActiveRoom();
      const roomName = activeRoom ? activeRoom.name : 'All Rooms';
      activeShareUrl = UrlState.buildShareUrl({
        eventName: state.eventName,
        activeRoomId: state.activeRoomId,
        rooms: state.rooms,
        pins: []
      });

      if (els.qrModalTitle) {
        els.qrModalTitle.textContent = `${state.eventName} · ${roomName}`;
      }
      if (els.qrSpotSummary) {
        els.qrSpotSummary.textContent = `${state.rooms.length} Room${state.rooms.length > 1 ? 's' : ''} · Stage & Bar Layout`;
      }
      if (els.qrLiveText) {
        els.qrLiveText.textContent = 'Guests can open radar on their phone instantly';
      }

      if (els.qrSvgWrap && window.ChromaQR) {
        els.qrSvgWrap.innerHTML = window.ChromaQR.toSVG(activeShareUrl, { margin: 4 });
      }

      els.qrModal.classList.remove('hidden');
    }

    els.btnSetupQr.addEventListener('click', openQr);

    if (els.btnCloseQr) els.btnCloseQr.addEventListener('click', closeQr);
    if (els.btnQrDone) els.btnQrDone.addEventListener('click', closeQr);

    els.qrModal.addEventListener('click', (e) => {
      if (e.target === els.qrModal) closeQr();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.qrModal && !els.qrModal.classList.contains('hidden')) {
        closeQr();
      }
    });

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
   * Initialization
   */
  function init() {
    initData();
    syncRoomEditorFields();
    renderRoomTabs();
    updateGuestLinks();
    renderCanvas();
    renderOverlay();
    syncSelectedFixtureInspector();

    setupViewportInteractions();
    setupFixturePalette();
    setupInspectorActions();
    setupRoomConfigInputs();
    setupAddRoomModal();
    setupCopyGuestLink();
    setupVenueQR();
    setupMapTools();

    window.addEventListener('resize', () => {
      renderCanvas();
      renderOverlay();
    });

    window.addEventListener('hashchange', () => {
      initData();
      syncRoomEditorFields();
      renderRoomTabs();
      renderCanvas();
      renderOverlay();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
