/**
 * ChromaFloor - Zero-Dependency Live Finder WebSocket Sync Engine
 * Pure JavaScript OASIS MQTT v3.1.1 over WebSockets (wss://) multi-broker client
 * Tailored for high-density, flaky mobile 4G/5G festival environments.
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ChromaLiveSync = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // Redundant public WSS MQTT brokers connected concurrently
  const BROKERS = [
    'wss://mqtt.eclipseprojects.io:443/mqtt',
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt'
  ];

  // UTF-8 TextEncoder / TextDecoder with safe fallbacks
  const textEncoder = typeof TextEncoder !== 'undefined'
    ? new TextEncoder()
    : {
        encode: function(str) {
          if (typeof Buffer !== 'undefined') {
            return new Uint8Array(Buffer.from(str, 'utf8'));
          }
          const utf8 = unescape(encodeURIComponent(str));
          const arr = new Uint8Array(utf8.length);
          for (let i = 0; i < utf8.length; i++) {
            arr[i] = utf8.charCodeAt(i);
          }
          return arr;
        }
      };

  const textDecoder = typeof TextDecoder !== 'undefined'
    ? new TextDecoder('utf-8')
    : {
        decode: function(uint8) {
          if (typeof Buffer !== 'undefined') {
            return Buffer.from(uint8).toString('utf8');
          }
          let str = '';
          for (let i = 0; i < uint8.length; i++) {
            str += String.fromCharCode(uint8[i]);
          }
          return decodeURIComponent(escape(str));
        }
      };

  /**
   * Generates URL-safe lowercase alphanumeric string
   */
  function randomAlphanumeric(len) {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    let res = '';
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint8Array(len);
      crypto.getRandomValues(bytes);
      for (let i = 0; i < len; i++) {
        res += chars[bytes[i] % chars.length];
      }
    } else {
      for (let i = 0; i < len; i++) {
        res += chars[Math.floor(Math.random() * chars.length)];
      }
    }
    return res;
  }

  /**
   * Generates a 10-char URL-safe session ID (e.g. 'k8m2p9x4q1')
   */
  function generateSessionId() {
    return randomAlphanumeric(10);
  }

  let inMemoryPeerId = null;

  /**
   * Returns persistent per-browser tab/user ID ('p_' + 8 chars)
   */
  function getOrCreatePeerId() {
    if (inMemoryPeerId) return inMemoryPeerId;
    const KEY = 'chromafloor_live_peer_id';
    try {
      if (typeof sessionStorage !== 'undefined') {
        const stored = sessionStorage.getItem(KEY);
        if (stored && /^p_[a-z0-9]{8}$/.test(stored)) {
          inMemoryPeerId = stored;
          return stored;
        }
      }
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(KEY);
        if (stored && /^p_[a-z0-9]{8}$/.test(stored)) {
          if (typeof sessionStorage !== 'undefined') {
            try { sessionStorage.setItem(KEY, stored); } catch (e) {}
          }
          inMemoryPeerId = stored;
          return stored;
        }
      }
    } catch (e) {}

    const newId = 'p_' + randomAlphanumeric(8);
    inMemoryPeerId = newId;
    try {
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(KEY, newId);
      if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, newId);
    } catch (e) {}
    return newId;
  }

  // --- OASIS MQTT v3.1.1 Binary Codec ---

  /**
   * Encodes an integer into MQTT 1-4 byte variable length representation
   */
  function encodeVarInt(num) {
    const bytes = [];
    let n = num;
    do {
      let digit = n % 128;
      n = Math.floor(n / 128);
      if (n > 0) {
        digit |= 0x80;
      }
      bytes.push(digit);
    } while (n > 0);
    return bytes;
  }

  /**
   * Decodes MQTT variable length integer from uint8 array starting at startOffset
   * Returns { value, bytesRead } or null if incomplete
   */
  function decodeVarInt(uint8, startOffset) {
    let multiplier = 1;
    let value = 0;
    let offset = startOffset || 0;
    let digit;
    do {
      if (offset >= uint8.length) return null;
      digit = uint8[offset++];
      value += (digit & 0x7f) * multiplier;
      multiplier *= 128;
      if (multiplier > 128 * 128 * 128) {
        throw new Error('Malformed variable length integer');
      }
    } while ((digit & 0x80) !== 0);
    return { value, bytesRead: offset - (startOffset || 0) };
  }

  /**
   * Encodes a string as 2-byte length-prefixed UTF-8 bytes
   */
  function encodeUTF8(str) {
    const bytes = textEncoder.encode(str);
    const len = bytes.length;
    const res = new Uint8Array(2 + len);
    res[0] = (len >> 8) & 0xff;
    res[1] = len & 0xff;
    res.set(bytes, 2);
    return res;
  }

  /**
   * Assembles a complete MQTT packet with fixed header, varint length, and body
   */
  function buildPacket(headerByte, bodyUint8) {
    const body = bodyUint8 instanceof Uint8Array ? bodyUint8 : new Uint8Array(bodyUint8 || 0);
    const varIntBytes = encodeVarInt(body.length);
    const packet = new Uint8Array(1 + varIntBytes.length + body.length);
    packet[0] = headerByte;
    packet.set(varIntBytes, 1);
    packet.set(body, 1 + varIntBytes.length);
    return packet;
  }

  /**
   * Builds CONNECT (0x10) packet with CleanSession=1 and KeepAlive=30s
   */
  function buildConnectPacket(clientId) {
    // Variable Header: [0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x1e]
    // Protocol: "MQTT" (len 4), level 4 (v3.1.1), flags 0x02 (CleanSession), keepalive 30s
    const varHeader = new Uint8Array([0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x1e]);
    const payload = encodeUTF8(clientId);
    const body = new Uint8Array(varHeader.length + payload.length);
    body.set(varHeader, 0);
    body.set(payload, varHeader.length);
    return buildPacket(0x10, body);
  }

  /**
   * Builds SUBSCRIBE (0x82) packet for 'chromafloor/live/v1/<sessionId>/+' with QoS 0
   */
  function buildSubscribePacket(sessionId, packetId) {
    const pId = packetId || 1;
    const varHeader = new Uint8Array([(pId >> 8) & 0xff, pId & 0xff]);
    const topicFilter = encodeUTF8('chromafloor/live/v1/' + sessionId + '/+');
    const qos = new Uint8Array([0x00]);
    const body = new Uint8Array(varHeader.length + topicFilter.length + qos.length);
    body.set(varHeader, 0);
    body.set(topicFilter, varHeader.length);
    body.set(qos, varHeader.length + topicFilter.length);
    return buildPacket(0x82, body);
  }

  /**
   * Builds PUBLISH (0x31) packet (QoS 0, RETAIN = 1)
   * If payloadObj is null/undefined, sends 0-byte payload to clear retained message
   */
  function buildPublishPacket(sessionId, peerId, payloadObj) {
    const topic = 'chromafloor/live/v1/' + sessionId + '/' + peerId;
    const topicBytes = encodeUTF8(topic);
    let payloadBytes;
    if (payloadObj === null || payloadObj === undefined) {
      payloadBytes = new Uint8Array(0);
    } else {
      const json = JSON.stringify(payloadObj);
      payloadBytes = textEncoder.encode(json);
    }
    const body = new Uint8Array(topicBytes.length + payloadBytes.length);
    body.set(topicBytes, 0);
    body.set(payloadBytes, topicBytes.length);
    return buildPacket(0x31, body);
  }

  /**
   * Builds PINGREQ (0xC0, 0x00) packet
   */
  function buildPingreqPacket() {
    return new Uint8Array([0xc0, 0x00]);
  }

  /**
   * Creates 120ms leading + trailing edge throttle function
   */
  function createThrottle(fn, waitMs) {
    let timer = null;
    let lastExec = 0;
    let lastArgs = null;

    function execute() {
      lastExec = Date.now();
      timer = null;
      const args = lastArgs;
      lastArgs = null;
      if (args) {
        fn.apply(null, args);
      }
    }

    return function throttled(...args) {
      lastArgs = args;
      const now = Date.now();
      const elapsed = now - lastExec;

      if (elapsed >= waitMs && !timer) {
        execute();
      } else if (!timer) {
        timer = setTimeout(execute, Math.max(0, waitMs - elapsed));
      }
    };
  }

  /**
   * Factory function to create a live synchronization client
   */
  function createClient(options) {
    const opts = options || {};
    let currentSessionId = opts.sessionId ? String(opts.sessionId).trim() : '';
    const myPeerId = opts.peerId || getOrCreatePeerId();
    const onPeersChange = typeof opts.onPeersChange === 'function' ? opts.onPeersChange : null;
    const onStatusChange = typeof opts.onStatusChange === 'function' ? opts.onStatusChange : null;
    const SocketClass = opts.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : (typeof globalThis !== 'undefined' ? globalThis.WebSocket : null));

    let isStopped = true;
    let heartbeatTimer = null;
    let lastPublishedMessage = null;
    let seq = 0;
    let lastStatusKey = '';

    // Active peers store: { [peerId]: { peerId, name, roomId, x, y, hex, colorName, zoneCode, ts, seq, _lastIsLive } }
    let peers = {};

    // Broker state list
    const brokerUrls = opts.brokers || BROKERS;
    const brokers = brokerUrls.map(url => ({
      url: url,
      ws: null,
      status: 'disconnected', // 'disconnected' | 'connecting' | 'connected'
      backoff: 1500,
      reconnectTimer: null,
      pingTimer: null,
      clientId: null,
      buffer: null
    }));

    function isDocumentVisible() {
      if (typeof document === 'undefined') return true;
      return document.visibilityState !== 'hidden';
    }

    function getStatus() {
      const connectedCount = brokers.filter(b => b.status === 'connected').length;
      let state = 'offline';
      if (connectedCount > 0) {
        state = 'live';
      } else if (!isStopped) {
        const isOnline = (typeof navigator === 'undefined' || navigator.onLine !== false);
        state = isOnline ? 'connecting' : 'offline';
      } else {
        state = 'offline';
      }
      return { connectedCount, state };
    }

    function getPeers() {
      const now = Date.now();
      const TWO_HOURS = 2 * 60 * 60 * 1000;
      const list = [];

      for (const pId in peers) {
        if (!Object.prototype.hasOwnProperty.call(peers, pId)) continue;
        const p = peers[pId];
        if (now - p.ts > TWO_HOURS) {
          delete peers[pId];
          continue;
        }
        list.push({
          peerId: p.peerId,
          name: p.name,
          roomId: p.roomId,
          x: p.x,
          y: p.y,
          hex: p.hex,
          colorName: p.colorName,
          zoneCode: p.zoneCode,
          ts: p.ts,
          isLive: (now - p.ts) < 45000
        });
      }
      return list;
    }

    function notifyStatus() {
      const current = getStatus();
      const key = `${current.connectedCount}:${current.state}`;
      if (key !== lastStatusKey) {
        lastStatusKey = key;
        if (onStatusChange) {
          try {
            onStatusChange(current);
          } catch (e) {
            console.warn('[ChromaLiveSync] onStatusChange error:', e);
          }
        }
      }
    }

    function notifyPeers() {
      if (onPeersChange) {
        try {
          onPeersChange(getPeers());
        } catch (e) {
          console.warn('[ChromaLiveSync] onPeersChange error:', e);
        }
      }
    }

    function pruneAndCheckLiveness() {
      const now = Date.now();
      const TWO_HOURS = 2 * 60 * 60 * 1000;
      let changed = false;

      for (const pId in peers) {
        if (!Object.prototype.hasOwnProperty.call(peers, pId)) continue;
        const p = peers[pId];
        if (now - p.ts > TWO_HOURS) {
          delete peers[pId];
          changed = true;
          continue;
        }
        const isLive = (now - p.ts) < 45000;
        if (p._lastIsLive !== isLive) {
          p._lastIsLive = isLive;
          changed = true;
        }
      }

      if (changed) {
        notifyPeers();
      }
    }

    function sendToConnectedBrokers(uint8Packet) {
      brokers.forEach(broker => {
        if (broker.status === 'connected' && broker.ws && broker.ws.readyState === 1) {
          try {
            broker.ws.send(uint8Packet.buffer || uint8Packet);
          } catch (e) {
            console.warn('[ChromaLiveSync] Failed to send packet to broker:', broker.url, e);
          }
        }
      });
    }

    function connectBroker(broker) {
      if (isStopped) return;
      if (!SocketClass) {
        console.warn('[ChromaLiveSync] WebSocket not available in this environment');
        return;
      }

      broker.status = 'connecting';
      notifyStatus();

      broker.clientId = 'cf' + randomAlphanumeric(14);
      broker.buffer = null;

      try {
        const ws = new SocketClass(broker.url, 'mqtt');
        ws.binaryType = 'arraybuffer';
        broker.ws = ws;

        ws.onopen = function() {
          if (isStopped || broker.ws !== ws) return;
          const connectPacket = buildConnectPacket(broker.clientId);
          try {
            ws.send(connectPacket.buffer || connectPacket);
          } catch (err) {
            console.warn('[ChromaLiveSync] Failed to send CONNECT:', broker.url, err);
          }
        };

        ws.onmessage = function(event) {
          if (isStopped || broker.ws !== ws) return;
          let incoming = new Uint8Array(event.data);

          // Concatenate leftover buffer from previous frame if any
          if (broker.buffer && broker.buffer.length > 0) {
            const merged = new Uint8Array(broker.buffer.length + incoming.length);
            merged.set(broker.buffer, 0);
            merged.set(incoming, broker.buffer.length);
            incoming = merged;
            broker.buffer = null;
          }

          let offset = 0;
          while (offset < incoming.length) {
            if (offset + 1 > incoming.length) {
              broker.buffer = incoming.slice(offset);
              break;
            }

            const headerByte = incoming[offset];
            const packetType = headerByte >> 4;
            const flags = headerByte & 0x0f;

            const varInt = decodeVarInt(incoming, offset + 1);
            if (!varInt) {
              broker.buffer = incoming.slice(offset);
              break;
            }

            const remainingLen = varInt.value;
            const headerLen = 1 + varInt.bytesRead;
            const totalLen = headerLen + remainingLen;

            if (offset + totalLen > incoming.length) {
              // Frame contains partial MQTT packet
              broker.buffer = incoming.slice(offset);
              break;
            }

            const body = incoming.subarray(offset + headerLen, offset + totalLen);
            handlePacket(broker, packetType, flags, body);
            offset += totalLen;
          }
        };

        ws.onerror = function() {
          // Socket error will lead to onclose
        };

        ws.onclose = function() {
          if (broker.pingTimer) {
            clearInterval(broker.pingTimer);
            broker.pingTimer = null;
          }
          broker.ws = null;
          broker.buffer = null;
          broker.status = 'disconnected';
          notifyStatus();

          if (!isStopped) {
            const delay = broker.backoff;
            broker.backoff = Math.min(broker.backoff * 2, 12000);
            broker.reconnectTimer = setTimeout(function() {
              connectBroker(broker);
            }, delay);
          }
        };
      } catch (err) {
        broker.status = 'disconnected';
        notifyStatus();
        if (!isStopped) {
          const delay = broker.backoff;
          broker.backoff = Math.min(broker.backoff * 2, 12000);
          broker.reconnectTimer = setTimeout(function() {
            connectBroker(broker);
          }, delay);
        }
      }
    }

    function handlePacket(broker, type, flags, body) {
      if (type === 2) {
        // CONNACK
        if (body.length >= 2 && body[1] === 0x00) {
          broker.status = 'connected';
          broker.backoff = 1500;
          notifyStatus();

          // Start ping timer every 20s
          if (broker.pingTimer) clearInterval(broker.pingTimer);
          broker.pingTimer = setInterval(function() {
            if (broker.ws && broker.ws.readyState === 1) {
              const ping = buildPingreqPacket();
              try {
                broker.ws.send(ping.buffer || ping);
              } catch (e) {}
            }
          }, 20000);

          // Subscribe if session is active
          if (currentSessionId && broker.ws && broker.ws.readyState === 1) {
            const sub = buildSubscribePacket(currentSessionId);
            try {
              broker.ws.send(sub.buffer || sub);
            } catch (e) {}
          }

          // Flush last published message if available
          if (lastPublishedMessage && currentSessionId && broker.ws && broker.ws.readyState === 1) {
            const pub = buildPublishPacket(currentSessionId, myPeerId, lastPublishedMessage);
            try {
              broker.ws.send(pub.buffer || pub);
            } catch (e) {}
          }
        } else {
          // Connection refused
          if (broker.ws) {
            try { broker.ws.close(); } catch (e) {}
          }
        }
      } else if (type === 3) {
        // PUBLISH
        const qos = (flags >> 1) & 0x03;
        if (body.length < 2) return;
        const topicLen = (body[0] << 8) | body[1];
        if (body.length < 2 + topicLen) return;

        const topicBytes = body.subarray(2, 2 + topicLen);
        const topic = textDecoder.decode(topicBytes);
        let payloadOffset = 2 + topicLen;
        if (qos > 0) {
          payloadOffset += 2; // skip Packet Identifier
        }

        const payloadBytes = body.subarray(payloadOffset);
        const topicParts = topic.split('/');
        const senderPeerId = topicParts[topicParts.length - 1];

        // Ignore messages from self
        if (!senderPeerId || senderPeerId === myPeerId) return;

        // Verify session matches
        const topicSessionId = topicParts[3];
        if (topicSessionId && topicSessionId !== currentSessionId) return;

        // 0-byte payload indicates peer left
        if (payloadBytes.length === 0) {
          if (peers[senderPeerId]) {
            delete peers[senderPeerId];
            notifyPeers();
          }
          return;
        }

        try {
          const jsonStr = textDecoder.decode(payloadBytes);
          const msg = JSON.parse(jsonStr);
          if (!msg || typeof msg !== 'object') return;
          if (msg.peerId === myPeerId) return;

          const existing = peers[msg.peerId];
          // Deduplicate across brokers: ignore identical (peerId, seq) and older ts
          if (existing) {
            if (existing.seq === msg.seq && existing.ts === msg.ts) {
              return;
            }
            if (typeof msg.ts === 'number' && msg.ts < existing.ts) {
              return;
            }
          }

          const now = Date.now();
          const ts = typeof msg.ts === 'number' ? msg.ts : now;
          const isLive = (now - ts) < 45000;

          peers[msg.peerId] = {
            peerId: msg.peerId,
            name: typeof msg.name === 'string' ? msg.name : 'Friend',
            roomId: typeof msg.roomId === 'string' ? msg.roomId : 'main',
            x: typeof msg.x === 'number' ? msg.x : 0.5,
            y: typeof msg.y === 'number' ? msg.y : 0.5,
            hex: typeof msg.hex === 'string' ? msg.hex : '#FFFFFF',
            colorName: typeof msg.colorName === 'string' ? msg.colorName : '',
            zoneCode: typeof msg.zoneCode === 'string' ? msg.zoneCode : '',
            ts: ts,
            seq: typeof msg.seq === 'number' ? msg.seq : 0,
            _lastIsLive: isLive
          };

          notifyPeers();
        } catch (e) {
          // Ignore malformed JSON payloads
        }
      }
    }

    // Visibility & Online event listeners for mobile unlock / wake
    function handleWakeReconnect() {
      if (isStopped) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      brokers.forEach(broker => {
        if (broker.status === 'disconnected') {
          if (broker.reconnectTimer) {
            clearTimeout(broker.reconnectTimer);
            broker.reconnectTimer = null;
          }
          broker.backoff = 1500;
          connectBroker(broker);
        }
      });

      if (lastPublishedMessage && currentSessionId) {
        seq++;
        lastPublishedMessage.ts = Date.now();
        lastPublishedMessage.seq = seq;
        const packet = buildPublishPacket(currentSessionId, myPeerId, lastPublishedMessage);
        sendToConnectedBrokers(packet);
      }
    }

    function rawPublish(spotData) {
      if (isStopped || !currentSessionId || !spotData) return;
      seq++;
      const now = Date.now();
      const msg = {
        v: 1,
        peerId: myPeerId,
        name: spotData.name || 'Friend',
        roomId: spotData.roomId || 'main',
        x: Number(spotData.x) || 0,
        y: Number(spotData.y) || 0,
        hex: spotData.hex || '#FFFFFF',
        colorName: spotData.colorName || '',
        zoneCode: spotData.zoneCode || '',
        ts: now,
        seq: seq
      };

      lastPublishedMessage = msg;
      const packet = buildPublishPacket(currentSessionId, myPeerId, msg);
      sendToConnectedBrokers(packet);
    }

    // 120ms leading + trailing throttle for smooth UI drags
    const throttledPublish = createThrottle(rawPublish, 120);

    return {
      start: function() {
        if (!isStopped) return;
        isStopped = false;

        // Bind visibility & online listeners
        if (typeof document !== 'undefined' && document.addEventListener) {
          document.addEventListener('visibilitychange', handleWakeReconnect);
        }
        if (typeof window !== 'undefined' && window.addEventListener) {
          window.addEventListener('online', handleWakeReconnect);
        }

        // Start 15s heartbeat & liveness check
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(function() {
          if (isStopped) return;
          if (isDocumentVisible() && lastPublishedMessage && currentSessionId) {
            seq++;
            lastPublishedMessage.ts = Date.now();
            lastPublishedMessage.seq = seq;
            const packet = buildPublishPacket(currentSessionId, myPeerId, lastPublishedMessage);
            sendToConnectedBrokers(packet);
          }
          pruneAndCheckLiveness();
        }, 15000);

        brokers.forEach(connectBroker);
        notifyStatus();
      },

      setSession: function(newSessionId) {
        const clean = newSessionId ? String(newSessionId).trim() : '';
        if (clean === currentSessionId) return;

        currentSessionId = clean;
        peers = {};
        notifyPeers();

        if (currentSessionId && !isStopped) {
          const sub = buildSubscribePacket(currentSessionId);
          sendToConnectedBrokers(sub);

          if (lastPublishedMessage) {
            seq++;
            lastPublishedMessage.ts = Date.now();
            lastPublishedMessage.seq = seq;
            const pub = buildPublishPacket(currentSessionId, myPeerId, lastPublishedMessage);
            sendToConnectedBrokers(pub);
          }
        }
      },

      publishSpot: function(spotData) {
        throttledPublish(spotData);
      },

      publishLeave: function() {
        if (!currentSessionId) return;
        const leavePacket = buildPublishPacket(currentSessionId, myPeerId, null);
        sendToConnectedBrokers(leavePacket);
        lastPublishedMessage = null;
      },

      getPeers: getPeers,
      getStatus: getStatus,

      stop: function() {
        if (isStopped) return;
        isStopped = true;

        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }

        if (typeof document !== 'undefined' && document.removeEventListener) {
          document.removeEventListener('visibilitychange', handleWakeReconnect);
        }
        if (typeof window !== 'undefined' && window.removeEventListener) {
          window.removeEventListener('online', handleWakeReconnect);
        }

        brokers.forEach(broker => {
          if (broker.reconnectTimer) {
            clearTimeout(broker.reconnectTimer);
            broker.reconnectTimer = null;
          }
          if (broker.pingTimer) {
            clearInterval(broker.pingTimer);
            broker.pingTimer = null;
          }
          if (broker.ws) {
            try {
              broker.ws.close();
            } catch (e) {}
            broker.ws = null;
          }
          broker.status = 'disconnected';
          broker.buffer = null;
        });

        notifyStatus();
      }
    };
  }

  return {
    BROKERS,
    encodeVarInt,
    decodeVarInt,
    encodeUTF8,
    buildPacket,
    buildConnectPacket,
    buildSubscribePacket,
    buildPublishPacket,
    buildPingreqPacket,
    randomAlphanumeric,
    generateSessionId,
    getOrCreatePeerId,
    createClient
  };
});
