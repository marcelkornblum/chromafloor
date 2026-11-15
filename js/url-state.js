/**
 * ChromaFloor - Zero-Backend URL Hash State Protocol (#cf1=)
 * Encodes and decodes multi-user festival crew spots, custom venue settings,
 * and builds resilient group chat share messages.
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    const ColorEngine = (typeof window !== 'undefined' && window.ChromaColorEngine) || require('./color-engine');
    module.exports = factory(ColorEngine);
  } else {
    root.ChromaUrlState = factory(root.ChromaColorEngine);
  }
})(typeof self !== 'undefined' ? self : this, function(ColorEngine) {
  'use strict';

  // Fixed baseline epoch (2023-11-14) to pack timestamps into small integer minutes
  const TS_EPOCH_MINUTES = 1700000000000;

  /**
   * Field sanitizers to prevent delimiter collision (: ; | ~ *) in user strings
   */
  function sanitizeField(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/\|/g, '/')
      .replace(/;/g, ',')
      .replace(/:/g, '-')
      .replace(/~/g, '-')
      .replace(/\*/g, '');
  }

  function desanitizeField(str) {
    return str || '';
  }

  /**
   * Helper to look up landmark icon by fixture type
   */
  function getFixtureIcon(type) {
    const fixtures = (ColorEngine && ColorEngine.FIXTURE_TYPES) || (typeof window !== 'undefined' && window.ChromaColorEngine && window.ChromaColorEngine.FIXTURE_TYPES);
    if (fixtures && fixtures[type] && fixtures[type].icon) {
      return fixtures[type].icon;
    }
    const fallbackIcons = {
      stage: '🎸',
      dj: '🎧',
      bar: '🍸',
      booth: '🎛️',
      speaker: '🔊',
      entrance: '🚪',
      wc: '🚻',
      water: '💧',
      cloak: '🧥',
      chill: '🌿',
      pillar: '🏛️',
      custom: '🏷️'
    };
    return fallbackIcons[type] || '📍';
  }

  /**
   * Encodes state object into #cf1= hash string
   * Schema: #cf1=encodeURIComponent("eventName;activeRoomId;focusPinId;packedPins;packedRooms")
   * where pins is: "id:name:roomId:x1000:y1000:tsMin:colorName:note:lat:lng|..."
   * where packedRooms is: "roomId:roomName:widthMeters:depthMeters:shape:landmarksStr:palette|..."
   * where landmarksStr is: "lmId*lmName*lmType*x1000*y1000~..."
   */
  function encodeState(stateObj) {
    if (!stateObj || typeof stateObj !== 'object') return '';

    const eventName = sanitizeField(stateObj.eventName || 'My Event');
    const activeRoomId = sanitizeField(stateObj.activeRoomId || 'main');
    const focusPinId = sanitizeField(stateObj.focusPinId || '');

    const rawPins = Array.isArray(stateObj.pins) ? stateObj.pins : [];
    // Limit to 20 pins to keep URL well within mobile browser bounds
    const packedPins = rawPins.slice(0, 20).map(p => {
      const id = sanitizeField(p.id || 'p');
      const name = sanitizeField(p.name || 'Friend');
      const roomId = sanitizeField(p.roomId || activeRoomId);
      const x1000 = Math.round(Math.max(0, Math.min(1, Number(p.x) || 0)) * 1000);
      const y1000 = Math.round(Math.max(0, Math.min(1, Number(p.y) || 0)) * 1000);

      // Relative timestamp in minutes from base epoch
      const tsMs = typeof p.ts === 'number' ? p.ts : Date.now();
      const tsMin = Math.max(0, Math.round((tsMs - TS_EPOCH_MINUTES) / 60000));

      const colorName = sanitizeField(p.colorName || '');
      const note = sanitizeField(p.note || '');
      const lat = p.lat !== undefined && p.lat !== null && !isNaN(p.lat) ? Number(p.lat).toFixed(6) : '';
      const lng = p.lng !== undefined && p.lng !== null && !isNaN(p.lng) ? Number(p.lng).toFixed(6) : '';

      return [id, name, roomId, x1000, y1000, tsMin, colorName, note, lat, lng].join(':');
    }).join('|');

    // Encode packed rooms
    let packedRooms = '';
    const rawRooms = Array.isArray(stateObj.rooms) ? stateObj.rooms : null;
    if (rawRooms && rawRooms.length > 0) {
      packedRooms = rawRooms.slice(0, 10).map(r => {
        const rId = sanitizeField(r.id || 'room');
        const rName = sanitizeField(r.name || 'Room');
        const rWidth = Math.round(Number(r.widthMeters) || 40);
        const rDepth = Math.round(Number(r.depthMeters) || 50);
        const rShape = sanitizeField(r.shape || 'stage');
        const rPalette = sanitizeField(r.palette || 'wheel');

        const lms = Array.isArray(r.landmarks) ? r.landmarks : [];
        const landmarksStr = lms.slice(0, 25).map(lm => {
          const lmId = sanitizeField(lm.id || 'lm');
          const lmName = sanitizeField(lm.name || 'Landmark');
          const lmType = sanitizeField(lm.type || 'custom');
          const lmX = Math.round(Math.max(0, Math.min(1, Number(lm.x) || 0)) * 1000);
          const lmY = Math.round(Math.max(0, Math.min(1, Number(lm.y) || 0)) * 1000);
          return [lmId, lmName, lmType, lmX, lmY].join('*');
        }).join('~');

        return [rId, rName, rWidth, rDepth, rShape, landmarksStr, rPalette].join(':');
      }).join('|');
    }

    const payload = [eventName, activeRoomId, focusPinId, packedPins, packedRooms].join(';');
    return `#cf1=${encodeURIComponent(payload)}`;
  }

  /**
   * Decodes #cf1= hash string back into structured state object
   * Returns null if hash is invalid or malformed
   */
  function decodeHash(hashString) {
    if (!hashString || typeof hashString !== 'string') return null;

    const trimmed = hashString.trim();
    const prefixIdx = trimmed.indexOf('#cf1=');
    if (prefixIdx === -1) return null;

    const rawPayload = trimmed.slice(prefixIdx + 5);
    if (!rawPayload) return null;

    try {
      const decoded = decodeURIComponent(rawPayload);
      const parts = decoded.split(';');
      if (parts.length < 2) return null;

      const eventName = desanitizeField(parts[0]) || 'My Event';
      const activeRoomId = desanitizeField(parts[1]) || 'main';
      const focusPinId = desanitizeField(parts[2]) || '';
      const pinsRaw = parts[3] || '';
      const roomsRaw = parts.length >= 5 ? parts[4] : '';

      const pins = [];
      if (pinsRaw.length > 0) {
        const pinEntries = pinsRaw.split('|');
        for (const entry of pinEntries) {
          if (!entry) continue;
          const f = entry.split(':');
          if (f.length < 5) continue;

          const id = desanitizeField(f[0]);
          const name = desanitizeField(f[1]);
          const roomId = desanitizeField(f[2]) || activeRoomId;
          const x = Math.max(0, Math.min(1, (parseInt(f[3], 10) || 0) / 1000));
          const y = Math.max(0, Math.min(1, (parseInt(f[4], 10) || 0) / 1000));

          const tsMin = parseInt(f[5], 10);
          const ts = !isNaN(tsMin) && tsMin > 0 ? (tsMin * 60000 + TS_EPOCH_MINUTES) : Date.now();

          const colorName = desanitizeField(f[6]);
          const note = desanitizeField(f[7]);
          const lat = (f[8] && f[8] !== '') ? parseFloat(f[8]) : null;
          const lng = (f[9] && f[9] !== '') ? parseFloat(f[9]) : null;

          pins.push({
            id,
            name,
            roomId,
            x,
            y,
            ts,
            colorName,
            note,
            lat,
            lng
          });
        }
      }

      let rooms = null;
      if (roomsRaw && roomsRaw.length > 0) {
        const roomEntries = roomsRaw.split('|');
        rooms = [];
        for (const rEntry of roomEntries) {
          if (!rEntry) continue;
          const rf = rEntry.split(':');
          if (rf.length < 5) continue;

          const rId = desanitizeField(rf[0]);
          const rName = desanitizeField(rf[1]);
          const widthMeters = parseInt(rf[2], 10) || 40;
          const depthMeters = parseInt(rf[3], 10) || 50;
          const shape = desanitizeField(rf[4]) || 'stage';
          const landmarksRaw = rf[5] || '';
          // 7th field is palette, defaults to 'wheel'
          const palette = desanitizeField(rf[6]) || 'wheel';

          const landmarks = [];
          if (landmarksRaw.length > 0) {
            const lmEntries = landmarksRaw.split('~');
            for (const lmEntry of lmEntries) {
              if (!lmEntry) continue;
              const lf = lmEntry.split('*');
              if (lf.length < 5) continue;

              const lmId = desanitizeField(lf[0]);
              const lmName = desanitizeField(lf[1]);
              const lmType = desanitizeField(lf[2]) || 'custom';
              const lmX = Math.max(0, Math.min(1, (parseInt(lf[3], 10) || 0) / 1000));
              const lmY = Math.max(0, Math.min(1, (parseInt(lf[4], 10) || 0) / 1000));
              const lmIcon = getFixtureIcon(lmType);

              landmarks.push({
                id: lmId,
                name: lmName,
                type: lmType,
                icon: lmIcon,
                x: lmX,
                y: lmY
              });
            }
          }

          rooms.push({
            id: rId,
            name: rName,
            widthMeters,
            depthMeters,
            shape,
            palette,
            landmarks
          });
        }
      }

      return {
        eventName,
        activeRoomId,
        focusPinId,
        pins,
        rooms
      };
    } catch (err) {
      console.warn('[ChromaUrlState] Failed to decode hash:', err);
      return null;
    }
  }

  /**
   * Returns base directory path ending with '/' by stripping setup.html or index.html
   */
  function getBaseDirPath() {
    if (typeof window !== 'undefined' && window.location) {
      let path = window.location.pathname || '/';
      // Strip trailing filename if index.html or setup.html
      path = path.replace(/(index\.html|setup\.html)$/i, '');
      if (!path.endsWith('/')) {
        path += '/';
      }
      return path;
    }
    return '/chromafloor/';
  }

  /**
   * Builds clean full URL that points to the simple Sharing UI (index.html)
   * Subpath-safe for GitHub Pages, custom domain, and localhost
   */
  function buildShareUrl(stateObj) {
    const hash = encodeState(stateObj);
    if (typeof window !== 'undefined' && window.location) {
      const origin = window.location.origin || '';
      const baseDir = getBaseDirPath();
      return `${origin}${baseDir}${hash}`;
    }
    return `https://marcelkornblum.github.io/chromafloor/${hash}`;
  }

  /**
   * Builds clean full URL that points to the Venue Setup Studio (setup.html)
   * Subpath-safe for GitHub Pages, custom domain, and localhost
   */
  function buildSetupUrl(stateObj) {
    const hash = encodeState(stateObj);
    if (typeof window !== 'undefined' && window.location) {
      const origin = window.location.origin || '';
      const baseDir = getBaseDirPath();
      return `${origin}${baseDir}setup.html${hash}`;
    }
    return `https://marcelkornblum.github.io/chromafloor/setup.html${hash}`;
  }

  /**
   * Builds clean single-spot share message
   */
  function buildSimpleSpotMessage(opts) {
    const opt = opts || {};
    const spotColor = opt.spotColor || { colorName: 'Pearl White', hex: '#FFFFFF', zoneCode: 'E5' };
    const room = opt.room || { name: 'Main Room' };
    const eventName = opt.eventName;
    const nearestPhrase = opt.nearestPhrase || '';
    const shareUrl = opt.shareUrl || '';

    const nearPart = nearestPhrase ? ` · ${nearestPhrase}` : '';
    const eventPart = (eventName && eventName !== 'My Event') ? ` — ${eventName}` : '';

    return `🎨 I'm at ${spotColor.colorName} (${spotColor.hex} · Zone ${spotColor.zoneCode}${nearPart}) in ${room.name}${eventPart}\n📍 See exact spot on the colour wheel: ${shareUrl}`;
  }

  /**
   * Legacy message builders for multi-crew chat messages
   */
  function buildChatMessages(opts) {
    const opt = opts || {};
    const userPin = opt.userPin || { name: 'Me', colorName: 'Pearl White', zoneCode: 'E5', hex: '#FFFFFF' };
    const room = opt.room || { name: 'Main Room' };
    const eventName = opt.eventName || 'My Event';
    const crewCount = Number.isFinite(opt.crewCount) ? opt.crewCount : 1;
    const shareUrl = opt.shareUrl || '';
    const nearestPhrase = opt.nearestPhrase || 'Center Floor';
    const note = (userPin.note || '').trim();

    const name = userPin.name || 'Me';
    const colorName = userPin.colorName || 'Pearl White';
    const zoneCode = userPin.zoneCode || 'E5';
    const hex = userPin.hex || '#FFFFFF';
    const roomName = room.name || 'Main Room';

    const notePart = note ? ` · "${note}"` : '';
    const crewPart = crewCount > 1 ? ` 👥 ${crewCount} on floor` : '';
    const gpsPart = (userPin.lat && userPin.lng) ? ` 📡 GPS: ${userPin.lat.toFixed(5)},${userPin.lng.toFixed(5)}` : '';

    const previewText = `🌈 ${name} is at ${colorName} (${zoneCode}) [${hex}] · ${roomName} (${eventName}) 📍 ${nearestPhrase}${notePart}${crewPart}`;
    const fullMessage = `${previewText}${gpsPart}\n🔗 Open floor radar: ${shareUrl}`;

    return {
      previewText,
      fullMessage
    };
  }

  function buildVenueShareMessage(opts) {
    const opt = opts || {};
    const eventName = opt.eventName || 'My Event';
    const rooms = Array.isArray(opt.rooms) ? opt.rooms : (opt.activeRoom ? [opt.activeRoom] : []);
    const roomNames = rooms.map(r => r.name || 'Main Room').join(', ') || 'Main Room';
    const shareUrl = opt.shareUrl || '';

    return `🗺️ ${eventName} floorplan (${roomNames}) — open radar & drop your spot: ${shareUrl}`;
  }

  return {
    TS_EPOCH_MINUTES,
    sanitizeField,
    desanitizeField,
    encodeState,
    decodeHash,
    getBaseDirPath,
    buildShareUrl,
    buildSetupUrl,
    buildSimpleSpotMessage,
    buildChatMessages,
    buildVenueShareMessage
  };
});
