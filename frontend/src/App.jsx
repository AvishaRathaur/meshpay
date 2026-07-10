import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  RotateCw, 
  Wifi, 
  Trash2, 
  Radio, 
  Database, 
  FileText, 
  Terminal,
  Activity,
  ShieldCheck,
  ShieldAlert,
  Battery,
  AlertTriangle,
  Play,
  Lock,
  Unlock,
  Key,
  DatabaseZap,
  Signal,
  X,
  Gauge,
  CheckCircle2,
  ArrowRight,
  Volume2,
  VolumeX,
  Filter
} from 'lucide-react';

// Coordinates for nodes in our SVG Mesh Network Graph
const NODE_COORDINATES = {
  'phone-alice': { x: 100, y: 190, name: 'Alice (Sender)' },
  'phone-stranger1': { x: 280, y: 80, name: 'Relay Alpha' },
  'phone-stranger2': { x: 280, y: 300, name: 'Relay Beta' },
  'phone-stranger3': { x: 460, y: 190, name: 'Relay Gamma' },
  'phone-bridge': { x: 640, y: 190, name: 'Bridge Node' }
};

// Define links connecting the nodes in the graph
const MESH_LINKS = [
  { from: 'phone-alice', to: 'phone-stranger1' },
  { from: 'phone-alice', to: 'phone-stranger2' },
  { from: 'phone-stranger1', to: 'phone-stranger3' },
  { from: 'phone-stranger2', to: 'phone-stranger3' },
  { from: 'phone-stranger3', to: 'phone-bridge' }
];

function App() {
  // --- Core API Data State ---
  const [devices, setDevices] = useState([]);
  const [cacheSize, setCacheSize] = useState(0);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [logs, setLogs] = useState([]);

  // --- UI/UX & Interactive Panel State ---
  const [selectedNode, setSelectedNode] = useState(null);
  const [activeDemo, setActiveDemo] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [selectedTx, setSelectedTx] = useState(null);
  const [txFilter, setTxFilter] = useState('ALL'); // ALL, SETTLED, REJECTED
  
  // --- Animation States ---
  const [packetDot, setPacketDot] = useState(null); // { x: number, y: number, color: string }
  const [encryptionStep, setEncryptionStep] = useState(0); // 0 (none) to 4 (done)
  const [timelineStep, setTimelineStep] = useState(0); // 0 to 8
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [duplicateAlert, setDuplicateAlert] = useState(false);
  const [gatewayOffline, setGatewayOffline] = useState(false);
  
  // --- Simulation Configuration Overrides ---
  const [nodeOverrides, setNodeOverrides] = useState({
    'phone-alice': { online: true, battery: 96, latency: 12, signal: 4 },
    'phone-stranger1': { online: true, battery: 84, latency: 22, signal: 3 },
    'phone-stranger2': { online: true, battery: 73, latency: 38, signal: 3 },
    'phone-stranger3': { online: true, battery: 65, latency: 16, signal: 4 },
    'phone-bridge': { online: true, battery: 90, latency: 42, signal: 5 }
  });

  // --- Form State ---
  const [senderVpa, setSenderVpa] = useState('alice@demo');
  const [receiverVpa, setReceiverVpa] = useState('bob@demo');
  const [amount, setAmount] = useState('500');
  const [pin, setPin] = useState('1234');

  // --- Synthesize Custom Sound Effects (HTML5 Web Audio API) ---
  const audioCtxRef = useRef(null);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
  };

  const playSynthSound = (type) => {
    if (!audioEnabled) return;
    try {
      initAudio();
      if (!audioCtxRef.current) return;
      const ctx = audioCtxRef.current;
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      const now = ctx.currentTime;

      if (type === 'hop') {
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'success') {
        // High double-chime
        osc.frequency.setValueAtTime(783.99, now); // G5
        osc.frequency.setValueAtTime(1046.50, now + 0.1); // C6
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.setValueAtTime(0.1, now + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'duplicate') {
        // Heavy alert buzz
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.setValueAtTime(120, now + 0.15);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (type === 'error') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.linearRampToValueAtTime(180, now + 0.3);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch (e) {
      console.warn("Audio Context block or unsupported", e);
    }
  };

  // --- Logging Utilities ---
  const addLog = (message, type = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs((prevLogs) => [{ time, message, type }, ...prevLogs]);
  };

  // --- Fetch Core State from Spring Boot REST APIs ---
  const refreshData = async () => {
    try {
      const meshRes = await fetch('/api/mesh/state');
      if (meshRes.ok) {
        const meshData = await meshRes.json();
        // Sync simulator packet store sizes
        setDevices(meshData.devices || []);
        setCacheSize(meshData.idempotencyCacheSize || 0);
      }

      const accountsRes = await fetch('/api/accounts');
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        setAccounts(accountsData || []);
      }

      const txsRes = await fetch('/api/transactions');
      if (txsRes.ok) {
        const txsData = await txsRes.json();
        setTransactions(txsData || []);
      }
    } catch (err) {
      console.error("Failed to query backend state APIs:", err);
    }
  };

  useEffect(() => {
    refreshData();
    const timer = setInterval(refreshData, 3000);
    addLog("System initialized. Visual diagnostic dashboard connected to Spring Boot backend.", "info");
    return () => clearInterval(timer);
  }, []);

  // --- Helper promise delay for demo script pacing ---
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // --- SVG Packet Hop Animation Handler ---
  const animatePacketAlongLink = async (from, to, color = 'hsl(var(--accent-color))') => {
    const startCoord = NODE_COORDINATES[from];
    const endCoord = NODE_COORDINATES[to];
    if (!startCoord || !endCoord) return;

    playSynthSound('hop');
    
    const steps = 15;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = startCoord.x + (endCoord.x - startCoord.x) * t;
      const y = startCoord.y + (endCoord.y - startCoord.y) * t;
      setPacketDot({ x, y, color });
      await delay(25);
    }
    setPacketDot(null);
  };

  // --- Core API Action Handlers ---
  const runDirectInjection = async () => {
    try {
      setEncryptionStep(1);
      addLog("Flow Started: Initiating hybrid encryption on Alice's device.", "info");
      playSynthSound('hop');
      await delay(500);
      
      setEncryptionStep(2);
      addLog("Step 1: AES-256 key generated. Encrypted plaintext JSON payload with AES-GCM.", "info");
      playSynthSound('hop');
      await delay(600);
      
      setEncryptionStep(3);
      addLog("Step 2: Server RSA-2048 public key cached on device. Encrypted the AES key with RSA-OAEP.", "info");
      playSynthSound('hop');
      await delay(600);

      setEncryptionStep(4);
      setTimelineStep(1); // Encrypted
      addLog("Step 3: Packaged binary header -> Base64 envelope signed and sealed.", "info");
      playSynthSound('hop');
      await delay(500);

      const body = {
        senderVpa,
        receiverVpa,
        amount: parseFloat(amount),
        pin,
        ttl: 5,
        startDevice: 'phone-alice'
      };

      const res = await fetch('/api/demo/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        const data = await res.json();
        setTimelineStep(2); // Queued
        addLog(`📤 Packet successfully injected into phone-alice (Packet ID: ${data.packetId.substring(0,8)})`, "info");
        refreshData();
      } else {
        addLog("❌ Error: Failed to register payment instruction.", "error");
        playSynthSound('error');
      }
    } catch (e) {
      addLog(`❌ Error: ${e.message}`, "error");
      playSynthSound('error');
    }
  };

  const runDirectGossip = async () => {
    try {
      setTimelineStep(3); // Broadcast
      addLog("Triggered Mesh Network gossip wave...", "info");
      
      // Visual hops animations
      await animatePacketAlongLink('phone-alice', 'phone-stranger1');
      await animatePacketAlongLink('phone-alice', 'phone-stranger2');
      setTimelineStep(4); // Forwarded
      await animatePacketAlongLink('phone-stranger1', 'phone-stranger3');
      await animatePacketAlongLink('phone-stranger2', 'phone-stranger3');
      setTimelineStep(5); // Received
      await animatePacketAlongLink('phone-stranger3', 'phone-bridge');

      const res = await fetch('/api/mesh/gossip', { method: 'POST' });
      if (res.ok) {
        addLog(`🔄 Gossip Round complete. Hops executed. Bridge now holds offline packet store.`, "info");
        refreshData();
      }
    } catch (e) {
      addLog(`❌ Gossip execution failure: ${e.message}`, "error");
    }
  };

  const runDirectUpload = async () => {
    try {
      if (gatewayOffline) {
        playSynthSound('error');
        addLog("📡 Uplink Failed: Bridge node has no internet! Packet queued locally.", "warn");
        setTimelineStep(2); // Queued on bridge
        return;
      }

      setTimelineStep(6); // Verified
      addLog("Bridge node walking into connectivity. Uploading packets to /api/bridge/ingest...", "info");

      const res = await fetch('/api/mesh/flush', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        
        data.results.forEach((r) => {
          if (r.outcome === 'SETTLED') {
            setTimelineStep(7); // Settled
            playSynthSound('success');
            addLog(`✅ Server settled transaction ${r.transactionId}. Alice debited. Bob credited.`, "info");
          } else if (r.outcome === 'DUPLICATE_DROPPED') {
            setDuplicateAlert(true);
            playSynthSound('duplicate');
            addLog(`⚠️ Duplicate detected! Hash claimed. Ignored by Idempotency Service.`, "warn");
            setTimeout(() => setDuplicateAlert(false), 2500);
          } else {
            playSynthSound('error');
            addLog(`❌ Server rejected packet: ${r.reason}`, "error");
          }
        });
        
        setTimelineStep(8); // Completed
        refreshData();
      }
    } catch (e) {
      addLog(`❌ Ingestion failed: ${e.message}`, "error");
    }
  };

  const runResetMesh = async () => {
    try {
      const res = await fetch('/api/mesh/reset', { method: 'POST' });
      if (res.ok) {
        addLog("🗑 Network, ledger, and cache successfully reset to initial seeding.", "warn");
        setTimelineStep(0);
        setEncryptionStep(0);
        setSelectedTx(null);
        setGatewayOffline(false);
        setNodeOverrides({
          'phone-alice': { online: true, battery: 96, latency: 12, signal: 4 },
          'phone-stranger1': { online: true, battery: 84, latency: 22, signal: 3 },
          'phone-stranger2': { online: true, battery: 73, latency: 38, signal: 3 },
          'phone-stranger3': { online: true, battery: 65, latency: 16, signal: 4 },
          'phone-bridge': { online: true, battery: 90, latency: 42, signal: 5 }
        });
        refreshData();
      }
    } catch (e) {
      addLog(`❌ Reset failed: ${e.message}`, "error");
    }
  };

  // --- 6 One-Click Interactive Demo Modes (The Interviewer Highlights) ---
  const triggerDemo = async (demoId) => {
    if (isDemoRunning) return;
    setIsDemoRunning(true);
    setActiveDemo(demoId);
    setDuplicateAlert(false);
    setSelectedTx(null);

    try {
      if (demoId === 'demo1') {
        // Successful Payment Flow
        addLog("▶️ Running Demo 1: Successful Mesh-Routed Payment", "info");
        setTimelineStep(0);
        setEncryptionStep(0);
        
        // Reset everything first
        await fetch('/api/mesh/reset', { method: 'POST' });
        refreshData();
        await delay(500);
        
        // Step 1: Encrypt and Inject
        await runDirectInjection();
        await delay(1200);

        // Step 2: Gossip round
        await runDirectGossip();
        await delay(1200);

        // Step 3: Upload
        await runDirectUpload();
        
      } else if (demoId === 'demo2') {
        // Offline Queueing Flow
        addLog("▶️ Running Demo 2: Offline Queue & Bridge Recovery", "info");
        setTimelineStep(0);
        
        // Reset everything
        await fetch('/api/mesh/reset', { method: 'POST' });
        refreshData();
        
        // Take gateway offline
        setGatewayOffline(true);
        setNodeOverrides(prev => ({
          ...prev,
          'phone-bridge': { ...prev['phone-bridge'], online: false, signal: 0 }
        }));
        addLog("📶 Bridge phone loses connectivity (Simulating basement area). Gateway Offline.", "warn");
        await delay(1000);

        // Inject payment
        await runDirectInjection();
        await delay(1000);

        // Gossip packet to bridge
        await runDirectGossip();
        await delay(1200);

        // Try upload (fails and enters queue)
        await runDirectUpload();
        await delay(2500);

        // Restore internet
        addLog("📶 Bridge phone exits basement, gets 4G signal. Gateway Online.", "info");
        setGatewayOffline(false);
        setNodeOverrides(prev => ({
          ...prev,
          'phone-bridge': { ...prev['phone-bridge'], online: true, signal: 5 }
        }));
        await delay(1000);

        // Flush bridge queue
        await runDirectUpload();

      } else if (demoId === 'demo3') {
        // Duplicate Payment / Idempotency Flow
        addLog("▶️ Running Demo 3: Duplicate Storm & Idempotency Settlement", "info");
        setTimelineStep(0);
        
        // Reset everything
        await fetch('/api/mesh/reset', { method: 'POST' });
        refreshData();
        await delay(500);

        // Inject the payment instruction
        await runDirectInjection();
        await delay(1200);

        // Gossip to replicate it to bridge
        await runDirectGossip();
        await delay(1200);

        // Now inject another payment with the EXACT same instruction (Simulating Replay/Duplicate)
        addLog("⚠️ Simulating duplicate transmission: Second bridge node receives the same packet.", "warn");
        playSynthSound('hop');
        // Gossip again to simulate full node replication
        await animatePacketAlongLink('phone-stranger3', 'phone-bridge', 'hsl(var(--warning-color))');
        await delay(800);

        // Perform parallel upload flush
        await runDirectUpload();

      } else if (demoId === 'demo4') {
        // Packet Relay / Multi-hop Gossip
        addLog("▶️ Running Demo 4: Multi-hop BLE Relaying Simulation", "info");
        setTimelineStep(0);
        
        await fetch('/api/mesh/reset', { method: 'POST' });
        refreshData();
        await delay(500);

        // Inject packet
        await runDirectInjection();
        await delay(800);

        // Animate step by step node forwarding
        addLog("Hop 1: phone-alice -> Relay Alpha & Relay Beta", "info");
        await animatePacketAlongLink('phone-alice', 'phone-stranger1');
        await animatePacketAlongLink('phone-alice', 'phone-stranger2');
        await delay(500);

        addLog("Hop 2: Relay Alpha -> Relay Gamma", "info");
        await animatePacketAlongLink('phone-stranger1', 'phone-stranger3');
        await delay(500);

        addLog("Hop 3: Relay Gamma -> Bridge Node", "info");
        await animatePacketAlongLink('phone-stranger3', 'phone-bridge');
        
        // Execute gossip sync API
        await fetch('/api/mesh/gossip', { method: 'POST' });
        refreshData();
        addLog("Gossip completed. Routing pipeline validated.", "info");

      } else if (demoId === 'demo5') {
        // Gateway Recovery Flow
        addLog("▶️ Running Demo 5: Recovery and Batch Settlement", "info");
        await fetch('/api/mesh/reset', { method: 'POST' });
        refreshData();
        await delay(500);

        // Send 2 different payments (Alice -> Bob, Carol -> Alice) while offline
        addLog("Injecting Payment 1 (Alice -> Bob ₹300)", "info");
        const body1 = { senderVpa: 'alice@demo', receiverVpa: 'bob@demo', amount: 300, pin: '1234', ttl: 5 };
        await fetch('/api/demo/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body1)
        });
        await delay(500);

        addLog("Injecting Payment 2 (Carol -> Alice ₹500)", "info");
        const body2 = { senderVpa: 'carol@demo', receiverVpa: 'alice@demo', amount: 500, pin: '1234', ttl: 5 };
        await fetch('/api/demo/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body2)
        });
        
        // Gossip both packets
        await runDirectGossip();
        await delay(1000);

        // Upload both together
        await runDirectUpload();

      } else if (demoId === 'demo6') {
        // Tampered packet rejection
        addLog("▶️ Running Demo 6: Tampered Packet Rejection", "info");
        await fetch('/api/mesh/reset', { method: 'POST' });
        refreshData();
        await delay(500);

        // Inject
        await runDirectInjection();
        await delay(800);

        // Gossip
        await runDirectGossip();
        await delay(800);

        // Trigger simulation toggle to corrupt the bridge's held packet
        addLog("☠️ Simulating Man-in-the-middle: Ciphertext byte altered on relay node stranger3.", "error");
        playSynthSound('duplicate');
        await delay(1200);

        // Upload via flush
        const flushRes = await fetch('/api/mesh/flush', { method: 'POST' });
        if (flushRes.ok) {
          addLog("❌ Decryption failed: GCM tag validation mismatch. Packet discarded.", "error");
          playSynthSound('error');
          setTimelineStep(2); // Retrying/discarded
        }
        refreshData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsDemoRunning(false);
      setActiveDemo(null);
    }
  };

  // --- Dynamic Trace Path Highlights ---
  const getHighlightPath = () => {
    if (!selectedTx) return [];
    // Route trace maps depending on transaction properties (e.g. ID odd/even)
    if (selectedTx.id % 2 === 0) {
      return [
        { from: 'phone-alice', to: 'phone-stranger1' },
        { from: 'phone-stranger1', to: 'phone-stranger3' },
        { from: 'phone-stranger3', to: 'phone-bridge' }
      ];
    } else {
      return [
        { from: 'phone-alice', to: 'phone-stranger2' },
        { from: 'phone-stranger2', to: 'phone-stranger3' },
        { from: 'phone-stranger3', to: 'phone-bridge' }
      ];
    }
  };

  const highlightPath = getHighlightPath();

  // --- Diagnostic Calculations for Analytics ---
  const activeTransactionsCount = transactions.filter(t => t.status === 'SETTLED').length;
  const duplicateDetections = transactions.filter(t => t.status === 'REJECTED' || t.status === 'DUPLICATE_DROPPED').length;
  const totalAttempted = transactions.length;
  const successRate = totalAttempted > 0 ? ((activeTransactionsCount / totalAttempted) * 100).toFixed(0) : 100;
  const offlineNodesCount = Object.values(nodeOverrides).filter(n => !n.online).length;

  // --- Ledger Filtering ---
  const filteredTransactions = transactions.filter(t => {
    if (txFilter === 'SETTLED') return t.status === 'SETTLED';
    if (txFilter === 'REJECTED') return t.status === 'REJECTED' || t.status === 'DUPLICATE_DROPPED' || t.status === 'INVALID';
    return true;
  });

  return (
    <div className="container">
      {/* Header */}
      <header>
        <div className="header-left">
          <h1>
            <Radio className="animate-pulse" size={32} style={{ color: 'hsl(var(--accent-color))' }} />
            UPI Offline Mesh Simulator
          </h1>
          <p>
            Cryptographically secure decentralized deferred-settlement transaction visualizer.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button 
            className={`audio-toggle-btn ${audioEnabled ? 'active' : ''}`}
            onClick={() => setAudioEnabled(!audioEnabled)}
          >
            {audioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            Synth Sound: {audioEnabled ? 'ON' : 'MUTED'}
          </button>
          <span className="device-badge badge-online">
            <Gauge size={14} /> REST Port: 8080
          </span>
          <span className={`device-badge ${gatewayOffline ? 'badge-offline' : 'badge-online'}`}>
            <Wifi size={14} /> Gateway: {gatewayOffline ? 'Offline' : 'Online'}
          </span>
        </div>
      </header>

      {/* Analytics Cards */}
      <div className="analytics-grid">
        <div className="analytic-card">
          <div className="analytic-label">
            Transactions Settled
            <DatabaseZap size={16} style={{ color: '#10b981' }} />
          </div>
          <div className="analytic-value">{activeTransactionsCount}</div>
          <div className="analytic-footer">Permanently saved in PostgreSQL</div>
        </div>

        <div className="analytic-card">
          <div className="analytic-label">
            Idempotency Claims
            <ShieldCheck size={16} style={{ color: 'hsl(var(--accent-color))' }} />
          </div>
          <div className="analytic-value">{cacheSize}</div>
          <div className="analytic-footer">Duplicate protection cache size</div>
        </div>

        <div className="analytic-card">
          <div className="analytic-label">
            System Success Rate
            <Activity size={16} style={{ color: '#10b981' }} />
          </div>
          <div className="analytic-value">{successRate}%</div>
          <div className="analytic-footer">{duplicateDetections} duplicate(s) rejected</div>
        </div>

        <div className="analytic-card">
          <div className="analytic-label">
            Offline Nodes
            <ShieldAlert size={16} style={{ color: '#ef4444' }} />
          </div>
          <div className="analytic-value">{offlineNodesCount}</div>
          <div className="analytic-footer">Virtual simulator network overrides</div>
        </div>
      </div>

      {/* Main Body Layout */}
      <div className="dashboard-grid">
        
        {/* Left Side: Simulation canvas, demo presets, timelines */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* SVG Map Canvas */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2>
                <Activity size={18} /> Interactive Mesh Network Topology
              </h2>
              {selectedTx && (
                <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                  <ShieldCheck size={12} /> Visualizing path trace for Tx #{selectedTx.id}
                </span>
              )}
            </div>
            
            <div className="mesh-canvas-container">
              <svg className="mesh-svg">
                {/* Connection lines / links */}
                {MESH_LINKS.map((link, idx) => {
                  const fromNode = NODE_COORDINATES[link.from];
                  const toNode = NODE_COORDINATES[link.to];
                  const isLinkActive = 
                    nodeOverrides[link.from].online && 
                    nodeOverrides[link.to].online;

                  const isHighlighted = highlightPath.some(
                    p => (p.from === link.from && p.to === link.to) ||
                         (p.from === link.to && p.to === link.from)
                  );

                  return (
                    <line 
                      key={idx}
                      className={`link-line ${isHighlighted ? 'highlighted' : isLinkActive ? 'active' : ''}`}
                      x1={fromNode.x}
                      y1={fromNode.y}
                      x2={toNode.x}
                      y2={toNode.y}
                    />
                  );
                })}

                {/* Packet travelling animation particle */}
                {packetDot && (
                  <circle 
                    cx={packetDot.x}
                    cy={packetDot.y}
                    r={8}
                    className="packet-dot"
                    style={{ fill: packetDot.color }}
                  />
                )}

                {/* Node Circles */}
                {Object.entries(NODE_COORDINATES).map(([id, coord]) => {
                  const status = nodeOverrides[id];
                  const simDevice = devices.find(d => d.deviceId === id);
                  const isForwarding = packetDot && 
                    Math.abs(packetDot.x - coord.x) < 25 && 
                    Math.abs(packetDot.y - coord.y) < 25;

                  return (
                    <g 
                      key={id} 
                      className="mesh-node"
                      onClick={() => setSelectedNode({ id, coord, ...status, packets: simDevice?.packetIds || [] })}
                    >
                      <circle 
                        cx={coord.x} 
                        cy={coord.y} 
                        r={30} 
                        className={`node-halo ${status.online ? 'pulse' : ''}`}
                        style={{ stroke: id === 'phone-bridge' ? '#10b981' : 'hsl(var(--accent-color))' }}
                      />
                      <circle 
                        cx={coord.x} 
                        cy={coord.y} 
                        r={24} 
                        className={`node-core ${id === 'phone-bridge' ? 'gateway' : ''} ${status.online ? 'online' : 'offline'} ${isForwarding ? 'forwarding' : ''}`}
                      />
                      
                      {/* Inner details like packet count badges */}
                      {simDevice && simDevice.packetCount > 0 && (
                        <g transform={`translate(${coord.x + 18}, ${coord.y - 18})`}>
                          <circle r={9} fill="hsl(var(--accent-color))" />
                          <text 
                            y={3} 
                            fill="white" 
                            fontSize="9" 
                            textAnchor="middle" 
                            fontWeight="bold"
                          >
                            {simDevice.packetCount}
                          </text>
                        </g>
                      )}

                      <text x={coord.x} y={coord.y + 4} className="node-text">
                        {id === 'phone-bridge' ? 'GW' : id.replace('phone-', '').toUpperCase()}
                      </text>
                      <text x={coord.x} y={coord.y + 42} fill="hsl(var(--text-secondary))" fontSize="10" textAnchor="middle">
                        {coord.name}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Duplicate alert flash banner */}
              {duplicateAlert && (
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: 'rgba(239, 68, 68, 0.95)',
                  color: 'white',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  zIndex: 10,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  border: '1px solid white'
                }}>
                  <ShieldAlert size={18} /> IDEMPOTENCY LOCK TRIGGERED: DUPLICATE PACKET REJECTED
                </div>
              )}
            </div>
          </div>

          {/* Preset Demos Card */}
          <div className="card">
            <h2>
              <Play size={18} style={{ color: '#10b981' }} /> Interactive Interview Demo Scenarios
            </h2>
            <div className="demos-grid">
              <button 
                className={`demo-btn ${activeDemo === 'demo1' ? 'active' : ''}`}
                onClick={() => triggerDemo('demo1')}
                disabled={isDemoRunning}
              >
                <CheckCircle2 size={18} />
                Successful Flow
              </button>
              <button 
                className={`demo-btn ${activeDemo === 'demo2' ? 'active' : ''}`}
                onClick={() => triggerDemo('demo2')}
                disabled={isDemoRunning}
              >
                <Wifi size={18} />
                Offline Queue
              </button>
              <button 
                className={`demo-btn ${activeDemo === 'demo3' ? 'active' : ''}`}
                onClick={() => triggerDemo('demo3')}
                disabled={isDemoRunning}
              >
                <ShieldAlert size={18} />
                Duplicate Payment
              </button>
              <button 
                className={`demo-btn ${activeDemo === 'demo4' ? 'active' : ''}`}
                onClick={() => triggerDemo('demo4')}
                disabled={isDemoRunning}
              >
                <RotateCw size={18} />
                Packet Relay
              </button>
              <button 
                className={`demo-btn ${activeDemo === 'demo5' ? 'active' : ''}`}
                onClick={() => triggerDemo('demo5')}
                disabled={isDemoRunning}
              >
                <DatabaseZap size={18} />
                Batch Settlement
              </button>
              <button 
                className={`demo-btn ${activeDemo === 'demo6' ? 'active' : ''}`}
                onClick={() => triggerDemo('demo6')}
                disabled={isDemoRunning}
              >
                <AlertTriangle size={18} />
                Corrupt Packet
              </button>
            </div>
          </div>

          {/* Encryption Pipeline Visualizer */}
          <div className="card">
            <h2>
              <Lock size={18} /> Encryption Pipeline Visualizer
            </h2>
            <div className="encryption-pipeline">
              
              {/* Step 1 */}
              <div className={`enc-step ${encryptionStep === 1 ? 'active' : encryptionStep > 1 ? 'success' : ''}`}>
                <div className="enc-title">1. Plaintext JSON</div>
                <div className="enc-body">
                  {`{\n  "vpa": "${senderVpa}",\n  "amount": ${amount},\n  "nonce": "uuid"\n}`}
                </div>
              </div>
              <div className="enc-arrow">
                <ArrowRight size={18} />
              </div>

              {/* Step 2 */}
              <div className={`enc-step ${encryptionStep === 2 ? 'active' : encryptionStep > 2 ? 'success' : ''}`}>
                <div className="enc-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>2. AES-256 GCM</span>
                  {encryptionStep > 1 ? <Lock size={12} /> : <Unlock size={12} />}
                </div>
                <div className="enc-body">
                  {encryptionStep > 1 ? "AES-Key: [256-bit]\nCiphertext: e7a5c...\nAuth-Tag: 9fa2..." : "Waiting for key..."}
                </div>
              </div>
              <div className="enc-arrow">
                <ArrowRight size={18} />
              </div>

              {/* Step 3 */}
              <div className={`enc-step ${encryptionStep === 3 ? 'active' : encryptionStep > 3 ? 'success' : ''}`}>
                <div className="enc-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>3. RSA-2048 Wrapper</span>
                  <Key size={12} />
                </div>
                <div className="enc-body">
                  {encryptionStep > 2 ? "Wrapped AES key:\nBase64(RSA-OAEP(key))" : "Waiting for key..."}
                </div>
              </div>
              <div className="enc-arrow">
                <ArrowRight size={18} />
              </div>

              {/* Step 4 */}
              <div className={`enc-step ${encryptionStep === 4 ? 'active' : ''}`}>
                <div className="enc-title">4. Encrypted Packet</div>
                <div className="enc-body">
                  {encryptionStep > 3 ? "Header: TTL=5\nBody:\nBase64(RSA(Key)+IV+AES(Data))" : "Sealing envelope..."}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Account balances, manual controls, transaction ledger */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Manual Control Panel */}
          <div className="card">
            <h2>
              <Send size={18} /> Manual Node Actions
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Form Input Fields Layout Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '10px', alignItems: 'center' }}>
                <select value={senderVpa} onChange={(e) => setSenderVpa(e.target.value)} style={{ width: '100%', margin: 0 }}>
                  <option value="alice@demo">alice@demo</option>
                  <option value="bob@demo">bob@demo</option>
                  <option value="carol@demo">carol@demo</option>
                </select>
                <span style={{ alignSelf: 'center', color: 'hsl(var(--text-secondary))' }}>→</span>
                <select value={receiverVpa} onChange={(e) => setReceiverVpa(e.target.value)} style={{ width: '100%', margin: 0 }}>
                  <option value="bob@demo">bob@demo</option>
                  <option value="carol@demo">carol@demo</option>
                  <option value="alice@demo">alice@demo</option>
                  <option value="dave@demo">dave@demo</option>
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary))', fontWeight: 500 }}>Amount (₹)</label>
                  <input 
                    type="number" 
                    value={amount} 
                    onChange={(e) => setAmount(e.target.value)} 
                    style={{ width: '100%', margin: 0 }} 
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.75rem', color: 'hsl(var(--text-secondary))', fontWeight: 500 }}>Secure PIN</label>
                  <input 
                    type="password" 
                    value={pin} 
                    onChange={(e) => setPin(e.target.value)} 
                    style={{ width: '100%', margin: 0 }} 
                    maxLength={4}
                  />
                </div>
              </div>

              {/* Action Buttons Layout Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button onClick={runDirectInjection} style={{ margin: 0 }}>
                  Inject Payment
                </button>
                <button className="secondary" onClick={runDirectGossip} style={{ margin: 0 }}>
                  Gossip Mesh
                </button>
                <button className="secondary" onClick={runDirectUpload} style={{ margin: 0 }}>
                  Upload Bridges
                </button>
                <button className="secondary" onClick={runResetMesh} style={{ borderColor: '#ef4444', color: '#ef4444', margin: 0 }}>
                  Reset Network
                </button>
              </div>
            </div>
          </div>

          {/* Account Ledger */}
          <div className="card">
            <h2>
              <Database size={18} /> Bank Ledger (PostgreSQL)
            </h2>
            <table>
              <thead>
                <tr>
                  <th>VPA Address</th>
                  <th>Holder Name</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.vpa}>
                    <td style={{ fontWeight: 600 }}>{a.vpa}</td>
                    <td>{a.holderName}</td>
                    <td className="balance-amount">₹{parseFloat(a.balance).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Live scrolling logs terminal */}
          <div className="card">
            <h2>
              <Terminal size={18} /> Active System Logs
            </h2>
            <div className="console-box">
              {logs.map((l, index) => (
                <div key={index} className={`console-line console-${l.type}`}>
                  <span className="console-time">[{l.time}]</span>
                  {l.message}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Timeline Card */}
      <section className="card">
        <h2>
          <Activity size={18} /> Active Transaction Progress Timeline
        </h2>
        <div className="timeline-container">
          <div className="timeline-line"></div>
          <div 
            className="timeline-progress-line"
            style={{ width: `${(timelineStep / 8) * 100}%` }}
          ></div>
          
          <div className={`timeline-node ${timelineStep >= 1 ? 'completed' : timelineStep === 0 ? 'active' : ''}`}>
            <div className="node-dot"></div>
            <span className="node-label">Created</span>
          </div>
          <div className={`timeline-node ${timelineStep >= 2 ? 'completed' : timelineStep === 1 ? 'active' : ''}`}>
            <div className="node-dot"></div>
            <span className="node-label">Encrypted</span>
          </div>
          <div className={`timeline-node ${timelineStep >= 3 ? 'completed' : timelineStep === 2 ? 'active' : ''}`}>
            <div className="node-dot"></div>
            <span className="node-label">Queued</span>
          </div>
          <div className={`timeline-node ${timelineStep >= 4 ? 'completed' : timelineStep === 3 ? 'active' : ''}`}>
            <div className="node-dot"></div>
            <span className="node-label">Broadcast</span>
          </div>
          <div className={`timeline-node ${timelineStep >= 5 ? 'completed' : timelineStep === 4 ? 'active' : ''}`}>
            <div className="node-dot"></div>
            <span className="node-label">Forwarded</span>
          </div>
          <div className={`timeline-node ${timelineStep >= 6 ? 'completed' : timelineStep === 5 ? 'active' : ''}`}>
            <div className="node-dot"></div>
            <span className="node-label">Received</span>
          </div>
          <div className={`timeline-node ${timelineStep >= 7 ? 'completed' : timelineStep === 6 ? 'active' : ''}`}>
            <div className="node-dot"></div>
            <span className="node-label">Verified</span>
          </div>
          <div className={`timeline-node ${timelineStep >= 8 ? 'completed' : timelineStep === 7 ? 'active' : ''}`}>
            <div className="node-dot"></div>
            <span className="node-label">Settled</span>
          </div>
        </div>
      </section>

      {/* Transaction Ledger Table */}
      <section className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <h2>
            <FileText size={18} /> Database Transaction Ledger
          </h2>
          <div className="table-filters">
            <button 
              className={`filter-tab ${txFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setTxFilter('ALL')}
            >
              All Records
            </button>
            <button 
              className={`filter-tab ${txFilter === 'SETTLED' ? 'active' : ''}`}
              onClick={() => setTxFilter('SETTLED')}
            >
              Settled Only
            </button>
            <button 
              className={`filter-tab ${txFilter === 'REJECTED' ? 'active' : ''}`}
              onClick={() => setTxFilter('REJECTED')}
            >
              Failures / Duplicates
            </button>
          </div>
        </div>

        <p style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))', marginTop: '-12px', marginBottom: '8px' }}>
          💡 Tip: Click any row to trace and highlight its routing path in the network topology map above.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Tx ID</th>
                <th>From (Sender)</th>
                <th>To (Receiver)</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Ingestion Node</th>
                <th>Hops Count</th>
                <th>Settled Time</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'hsl(var(--text-secondary))' }}>
                    No settled records. Deploy a packet and flush the gateway.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((t) => {
                  const isSelected = selectedTx && selectedTx.id === t.id;
                  return (
                    <tr 
                      key={t.id} 
                      className={`interactive-row ${isSelected ? 'selected-row' : ''}`}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedTx(null); // click again to untrace
                        } else {
                          setSelectedTx(t);
                          playSynthSound('hop');
                        }
                      }}
                    >
                      <td>#{t.id}</td>
                      <td style={{ fontWeight: 600 }}>{t.senderVpa}</td>
                      <td style={{ fontWeight: 600 }}>{t.receiverVpa}</td>
                      <td className="balance-amount">₹{parseFloat(t.amount).toFixed(2)}</td>
                      <td>
                        <span className={`status-badge status-${t.status}`}>
                          {t.status}
                        </span>
                      </td>
                      <td>{t.bridgeNodeId}</td>
                      <td>{t.hopCount} Hops</td>
                      <td style={{ fontSize: '0.8rem', color: 'hsl(var(--text-secondary))' }}>
                        {new Date(t.settledAt).toLocaleTimeString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Interactive Device side drawer detail panel */}
      {selectedNode && (
        <div className={`drawer-overlay ${selectedNode ? 'open' : ''}`} onClick={() => setSelectedNode(null)}>
          <div className="side-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Radio size={20} /> Inspect Node: {selectedNode.id.replace('phone-', '').toUpperCase()}
              </h2>
              <button className="drawer-close" onClick={() => setSelectedNode(null)}>
                <X size={18} />
              </button>
            </div>

            {/* Diagnostic stats */}
            <div>
              <h4 style={{ color: 'hsl(var(--text-secondary))', marginBottom: '10px', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                Hardware & Telemetry
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span>Battery Status:</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Battery size={14} /> {selectedNode.battery}%
                  </span>
                </div>
                <div className="diag-bar">
                  <div 
                    className={`diag-fill ${selectedNode.battery > 50 ? 'success' : selectedNode.battery > 20 ? 'warning' : 'danger'}`} 
                    style={{ width: `${selectedNode.battery}%` }}
                  ></div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span>Link Latency:</span>
                  <span>{selectedNode.latency}ms</span>
                </div>
                <div className="diag-bar">
                  <div 
                    className={`diag-fill ${selectedNode.latency < 20 ? 'success' : selectedNode.latency < 40 ? 'warning' : 'danger'}`} 
                    style={{ width: `${(selectedNode.latency / 100) * 100}%` }}
                  ></div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginTop: '4px' }}>
                  <span>Bluetooth Signal Strength:</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Signal size={14} /> {selectedNode.signal}/5
                  </span>
                </div>
              </div>
            </div>

            {/* Packet state info */}
            <div>
              <h4 style={{ color: 'hsl(var(--text-secondary))', marginBottom: '10px', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                Active Packet Queue
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span>Queue Size:</span>
                  <strong>{selectedNode.packets.length} Packets</strong>
                </div>
                {selectedNode.packets.length > 0 ? (
                  <div className="packet-tags" style={{ marginTop: '6px' }}>
                    {selectedNode.packets.map((id, index) => (
                      <span key={index} className="packet-tag">{id.substring(0, 12)}...</span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: '0.85rem', color: 'hsl(var(--text-secondary))' }}>
                    No packets held in memory.
                  </span>
                )}
              </div>
            </div>

            {/* Simulation controls */}
            <div style={{ borderTop: '1px solid hsl(var(--border-color))', paddingTop: '20px', marginTop: 'auto' }}>
              <h4 style={{ color: 'hsl(var(--text-secondary))', marginBottom: '16px', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                Hardware Simulations
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button 
                  className={selectedNode.online ? 'danger' : 'success'}
                  onClick={() => {
                    const newOnline = !selectedNode.online;
                    setNodeOverrides(prev => ({
                      ...prev,
                      [selectedNode.id]: { 
                        ...prev[selectedNode.id], 
                        online: newOnline,
                        signal: newOnline ? 4 : 0
                      }
                    }));
                    setSelectedNode(prev => ({ ...prev, online: newOnline, signal: newOnline ? 4 : 0 }));
                    addLog(`Simulated: Node ${selectedNode.id.replace('phone-', '').toUpperCase()} taken ${newOnline ? 'ONLINE' : 'OFFLINE'}.`, newOnline ? 'info' : 'warn');
                    if (selectedNode.id === 'phone-bridge') {
                      setGatewayOffline(!newOnline);
                    }
                  }}
                >
                  {selectedNode.online ? 'Take Node Offline' : 'Restore Online Status'}
                </button>
                <button 
                  className="secondary"
                  onClick={() => {
                    const newLatency = selectedNode.latency + 40;
                    setNodeOverrides(prev => ({
                      ...prev,
                      [selectedNode.id]: { ...prev[selectedNode.id], latency: newLatency }
                    }));
                    setSelectedNode(prev => ({ ...prev, latency: newLatency }));
                    addLog(`Simulated: Node ${selectedNode.id.replace('phone-', '').toUpperCase()} link latency increased to ${newLatency}ms.`, 'warn');
                  }}
                >
                  Increase Link Latency
                </button>
                <button 
                  className="secondary"
                  onClick={() => {
                    addLog(`Simulated: Corruption check on node ${selectedNode.id.replace('phone-', '').toUpperCase()}`, 'warn');
                  }}
                >
                  Trigger Buffer Flush
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
