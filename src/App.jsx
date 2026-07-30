import React, { useState, useEffect } from 'react';
import mqtt from 'mqtt';
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Line } from 'recharts';

const API_BASE = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('172.20.') || window.location.hostname.startsWith('192.168.'))
  ? `http://${(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '172.20.10.2' : window.location.hostname}:5000`
  : 'https://kenny-striking-cooked-despite.trycloudflare.com';

export default function App() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lightState, setLightState] = useState(false);
  const [tvState, setTvState] = useState(false);
  const [blindState, setBlindState] = useState(true); // true = Up/열림, false = Down/닫힘
  const [acState, setAcState] = useState(false);
  const [acTemp, setAcTemp] = useState(24); // Default 24 degrees
  const [currentTemp, setCurrentTemp] = useState(22.5); // Initial real ambient reading
  const [petPresent, setPetPresent] = useState(true);
  const [currentPower, setCurrentPower] = useState(0.0);
  const [camIp, setCamIp] = useState('172.20.10.3');
  const [camTimestamp, setCamTimestamp] = useState(Date.now());


  const [deviceId, setDeviceId] = useState('');
  const [isRealTemp, setIsRealTemp] = useState(true);
  const [mqttClient, setMqttClient] = useState(null);
  const [powerHistory, setPowerHistory] = useState(() => {
    const data = [];
    const now = Date.now();
    for (let i = 299; i >= 0; i--) {
      const time = new Date(now - i * 1000);
      const m = time.getMinutes();
      const s = time.getSeconds();
      data.push({
        name: `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`,
        총합산전력: 0
      });
    }
    return data;
  });

  const calculateFanSpeed = (temp) => {
    const minPWM = 1;   // 30°C -> PWM 1 (최소 미풍 유지를 위해 0이 아닌 1로 설정)
    const maxPWM = 255; // 18°C -> PWM 255 (최대 냉방)
    const minTemp = 18;
    const maxTemp = 30;
    const ratio = (temp - minTemp) / (maxTemp - minTemp);
    const speed = Math.round(maxPWM - (ratio * (maxPWM - minPWM)));
    return Math.max(minPWM, Math.min(maxPWM, speed));
  };

  // Load log data
  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/logs`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
      console.error("Error fetching logs:", e);
    } finally {
      setLoading(false);
    }
  };

  // Seed DB if empty on load
  const initDb = async () => {
    try {
      await fetch(`${API_BASE}/api/init_db`, { method: 'POST' });
      fetchLogs();
    } catch (e) {
      console.error("Error initializing DB:", e);
    }
  };

  // Fetch live telemetry from Backend API
  const fetchTelemetry = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/telemetry`);
      if (res.ok) {
        const data = await res.json();
        if (data.temp !== null && data.temp !== undefined) {
          const tVal = parseFloat(data.temp);
          if (!isNaN(tVal) && tVal > -50 && tVal < 100) {
            setCurrentTemp(tVal);
            setIsRealTemp(true);
          }
        }
        if (data.deviceId) setDeviceId(data.deviceId);
        if (data.power !== null && data.power !== undefined) {
          const pVal = parseFloat(data.power);
          if (!isNaN(pVal)) setCurrentPower(pVal);
        }
        if (data.motion !== null && data.motion !== undefined) {
          setPetPresent(data.motion === 1);
        }
      }
    } catch (e) {
      console.error("Telemetry fetch error:", e);
    }
  };

  const mqttClientRef = React.useRef(null);

  useEffect(() => {
    initDb();
    fetchTelemetry();

    // Poll telemetry and logs every 2 seconds for guaranteed real-time sync
    const interval = setInterval(() => {
      fetchLogs();
      fetchTelemetry();
    }, 2000);

    // Derive MQTT WebSocket URL dynamically from API_BASE / SSL environment
    const wsUrl = API_BASE.startsWith('https://')
      ? API_BASE.replace('https://', 'wss://')
      : `ws://${window.location.hostname}:8083`;

    console.log("Connecting MQTT broker to:", wsUrl);
    const client = mqtt.connect(wsUrl);
    mqttClientRef.current = client;

    client.on('connect', () => {
      console.log('Connected to MQTT Broker via WebSocket');
      client.subscribe('ecopet_seojun/+/motion', { qos: 0 });
      client.subscribe('ecopet_seojun/+/power', { qos: 0 });
      client.subscribe('ecopet_seojun/+/temp', { qos: 0 });
      client.subscribe('ecopet_seojun/+/environment', { qos: 0 });
    });

    client.on('message', (topic, payload) => {
      const payloadStr = payload.toString();

      if (topic.includes('/motion')) {
        setPetPresent(payloadStr === '1');
      }

      if (topic.includes('/temp') || topic.includes('/environment')) {
        let tVal = NaN;
        const directNum = parseFloat(payloadStr);
        if (!isNaN(directNum)) {
          tVal = directNum;
        } else {
          try {
            const parsed = JSON.parse(payloadStr);
            if (typeof parsed === 'object' && parsed !== null) {
              if (parsed.temp !== undefined) tVal = parseFloat(parsed.temp);
              else if (parsed.temperature !== undefined) tVal = parseFloat(parsed.temperature);
            }
          } catch (e) {}
        }

        if (!isNaN(tVal) && tVal > -50 && tVal < 100) {
          setCurrentTemp(tVal);
          setIsRealTemp(true);
        }
      }

      if (topic.includes('/power')) {
        const pwrVal = parseFloat(payloadStr);
        if (!isNaN(pwrVal)) {
          setCurrentPower(pwrVal);
          setPowerHistory(prev => {
            const time = new Date();
            const m = time.getMinutes();
            const s = time.getSeconds();
            const timeStr = `${m < 10 ? '0'+m : m}:${s < 10 ? '0'+s : s}`;
            const newHistory = [...prev, { name: timeStr, 총합산전력: pwrVal }];
            if (newHistory.length > 300) newHistory.shift();
            return newHistory;
          });
        }
        
        // Extract deviceId to use for publishing commands
        const parts = topic.split('/');
        if (parts.length >= 3) {
          setDeviceId(parts[1]);
        }
      }
    });

    return () => {
      clearInterval(interval);
      client.end();
    };
  }, []);

  // Unified Control Helper (REST API + Local Fallback + MQTT WebSocket)
  const sendControl = async (device, value) => {
    let success = false;

    // 1. Primary: Try API_BASE (lines 5-7 preserving trycloudflare URL)
    try {
      const res = await fetch(`${API_BASE}/api/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device, value: String(value) })
      });
      if (res.ok) success = true;
    } catch (e) {
      console.warn('Primary API_BASE control endpoint error:', e);
    }

    // 2. Local network fallback if primary API_BASE is unreachable
    if (!success) {
      try {
        await fetch(`http://172.20.10.2:5000/api/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device, value: String(value) }),
          mode: 'cors'
        });
      } catch (e) {
        console.warn('Local IP fallback endpoint error:', e);
      }
    }

    // 3. Direct MQTT WebSocket publish fallback
    if (mqttClientRef.current && mqttClientRef.current.connected) {
      mqttClientRef.current.publish(`ecopet_seojun/all/${device}/set`, String(value));
      if (deviceId) {
        mqttClientRef.current.publish(`ecopet_seojun/${deviceId}/${device}/set`, String(value));
      }
    }
  };

  // Toggle handlers
  const handleLightToggle = async () => {
    const newState = !lightState;
    setLightState(newState);
    const statusStr = newState ? 'ON' : 'OFF';
    
    // Control 5-NeoPixel LED (D1)
    sendControl('led', statusStr);

    try {
      await fetch(`${API_BASE}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_name: "스마트 조명",
          event_type: "수동 제어",
          details: `관리자가 거실 조명을 ${statusStr}(으)로 수동 전환함`
        })
      });
      fetchLogs();
    } catch (e) {
      console.error(e);
    }
  };

  const handleTvToggle = async () => {
    const newState = !tvState;
    setTvState(newState);
    const statusStr = newState ? 'ON' : 'OFF';

    // Control SSD1306 OLED Screen (TV role)
    sendControl('oled', statusStr);
    
    try {
      await fetch(`${API_BASE}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_name: "TV",
          event_type: "수동 제어",
          details: `관리자가 TV 전원을 ${statusStr}(으)로 수동 전환함`
        })
      });
      fetchLogs();
    } catch (e) {
      console.error(e);
    }
  };

  const handleBlindToggle = async () => {
    const newState = !blindState;
    setBlindState(newState);
    const statusStr = newState ? '올림 (열림)' : '내림 (닫힘)';
    const servoAngle = newState ? '90' : '0';
    
    // Control SG90 Servo Motor (D2)
    sendControl('servo', servoAngle);

    try {
      await fetch(`${API_BASE}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_name: "블라인드",
          event_type: "수동 제어",
          details: `관리자가 블라인드를 ${statusStr} 상태로 수동 전환함 (서보모터: ${servoAngle}도)`
        })
      });
      fetchLogs();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAcToggle = async () => {
    const newState = !acState;
    setAcState(newState);
    const statusStr = newState ? 'ON' : 'OFF';
    const pwmVal = newState ? calculateFanSpeed(acTemp) : 0;
    const msgPayload = newState ? pwmVal.toString() : 'OFF';

    // Control Cooling Fan PWM (D0)
    sendControl('fan', msgPayload);

    try {
      await fetch(`${API_BASE}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_name: "에어컨",
          event_type: "수동 제어",
          details: `관리자가 에어컨 전원을 ${statusStr}(으)로 수동 전환함`
        })
      });
      fetchLogs();
    } catch (e) {
      console.error(e);
    }
  };

  const handleTempChange = async (diff) => {
    const newTemp = acTemp + diff;
    if (newTemp < 18 || newTemp > 30) return; // AC limit 18°C ~ 30°C
    setAcTemp(newTemp);
    
    // Calculate PWM 255~1 (18°C -> 255, 30°C -> 1)
    const pwmVal = calculateFanSpeed(newTemp);
    
    sendControl('fan', pwmVal.toString());

    try {
      await fetch(`${API_BASE}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_name: "에어컨",
          event_type: "온도 설정",
          details: `관리자가 에어컨 설정 온도를 ${newTemp}°C로 변경함 (PWM: ${pwmVal})`
        })
      });
      fetchLogs();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSimulate = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/simulate`, { method: 'POST' });
      if (res.ok) {
        fetchLogs();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm("정말로 데이터베이스의 모든 로그를 초기화하시겠습니까?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/logs`, { method: 'DELETE' });
      if (res.ok) {
        fetchLogs();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // powerHistory is now managed in state based on real MQTT data

  return (
    <div className="container" style={{ paddingBottom: '4rem' }}>
      {/* Header */}
      <div style={{
        backgroundColor: '#16181e',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '2rem',
        borderRadius: '16px',
        marginBottom: '2rem',
        borderLeft: '8px solid #10b981',
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)'
      }}>
        <h1 style={{ color: 'white', margin: 0, fontSize: '2.2rem', fontWeight: 800 }}>
          🌱 Eco-Pet Care Smart Home IoT Dashboard
        </h1>
        <p style={{ color: '#9aa0a6', margin: '0.5rem 0 0 0', fontSize: '1.1rem' }}>
          반려동물의 <b>실시간 행동 상태(수면/부재)</b> 및 <b>스마트 방석 착석 여부</b> 감지 데이터를 분석하여 가전기기 대기전력을 자동으로 제어하는 스마트 홈 전력 최적화 솔루션입니다.
        </p>
      </div>

      {/* Main Grid Columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: window.innerWidth > 992 ? '1.2fr 1fr' : '1fr',
        gap: '2rem',
        marginBottom: '2rem'
      }}>
        {/* Left Column: CCTV Feed */}
        <div style={{
          background: 'rgba(22, 24, 30, 0.7)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          padding: '1.5rem',
          backdropFilter: 'blur(12px)'
        }}>
          <h3 style={{ fontSize: '1.3rem', marginBottom: '1rem', fontWeight: 700 }}>📹 CCTV 모니터링 피드</h3>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.75rem',
            backgroundColor: '#0b0c10',
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            width: 'fit-content',
            border: '1px solid rgba(255,255,255,0.08)'
          }}>
            <span style={{
              height: '10px',
              width: '10px',
              backgroundColor: '#ff4d4d',
              borderRadius: '50%',
              display: 'inline-block',
              animation: 'fadeIn 1s infinite alternate'
            }}></span>
            <span style={{ color: '#f5f6f8', fontWeight: 700, fontSize: '0.85rem' }}>LIVE REC [1080P]</span>
            <span style={{ color: '#9aa0a6', fontSize: '0.8rem', marginLeft: '0.5rem' }}>| 거실 스마트 펫 침대</span>
          </div>
          <div style={{ position: 'relative', width: '100%', overflow: 'hidden', borderRadius: '12px', background: '#000' }}>
            <img 
              src={`${API_BASE}/api/cam?t=${camTimestamp}`} 
              onLoad={() => {
                setCamTimestamp(Date.now());
              }}
              onError={(e) => {
                // If HTTPS proxy fails, try direct local IP
                e.target.src = `http://172.20.10.3/capture?t=${Date.now()}`;
                setTimeout(() => setCamTimestamp(Date.now()), 300);
              }}
              alt="ESP32 Live Video Feed" 
              style={{ width: '100%', height: '380px', objectFit: 'contain', display: 'block' }}
            />
            <div style={{
              position: 'absolute',
              bottom: '10px',
              left: '10px',
              background: 'rgba(0,0,0,0.7)',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '0.75rem',
              color: '#10b981',
              fontWeight: 600
            }}>
              ● LIVE ESP32 Cam (Ultra-Reliable Ping-Pong Mode)
            </div>
          </div>
        </div>

        {/* Right Column: Metrics */}
        <div style={{
          background: 'rgba(22, 24, 30, 0.7)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          padding: '2rem',
          backdropFilter: 'blur(12px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
            <h3 style={{ fontSize: '1.3rem', marginBottom: '1.5rem', fontWeight: 700 }}>📊 현재 스마트홈 IoT 상태</h3>
            
            {/* Metric 1 */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ color: '#9aa0a6', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>⚡ 스마트홈 제어 상태</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fbd604' }}>
                {petPresent ? "수면 중 (에너지 절감 모드)" : "부재 중 (대기 모드)"}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#10b981', marginTop: '0.25rem', fontWeight: 600 }}>
                {petPresent ? "✓ 절감 알고리즘 자동 작동 중" : "✓ 대기전력 보호 상태"}
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', margin: '1.5rem 0' }} />

            {/* Metric 2 */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ color: '#9aa0a6', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>⚖️ 스마트 방석 센서 상태</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>
                {petPresent ? "안착함" : "미안착"}
              </div>
              <div style={{ fontSize: '0.85rem', color: petPresent ? '#10b981' : '#9aa0a6', marginTop: '0.25rem', fontWeight: 600 }}>
                {petPresent ? "● 반려견 침대 재실 감지됨" : "○ 반려견 침대 부재 상태"}
              </div>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', margin: '1.5rem 0' }} />

            {/* Metric 3 */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ color: '#9aa0a6', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>💰 이번 달 누적 절약 전기 요금</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10b981' }}>₩ 12,500</div>
              <div style={{ fontSize: '0.85rem', color: '#10b981', marginTop: '0.25rem', fontWeight: 600 }}>
                +₩ 1,200 (전일 대기전력 자동 차단 대비)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Power Consumption Chart */}
      <div style={{
        background: 'rgba(22, 24, 30, 0.7)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '20px',
        padding: '1.5rem 2rem',
        marginBottom: '2rem',
        backdropFilter: 'blur(12px)'
      }}>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          🔌 실시간 가전 기기 전력 사용량 추이 (최근 5분)
        </h3>
        <p style={{ color: '#9aa0a6', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          방석의 안착 상태(수면 진입)에 따라 전체 전력 소비량을 모니터링합니다.
        </p>
        
        <div style={{ height: '300px', width: '100%', marginTop: '1rem' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={powerHistory} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Line type="monotone" dataKey="총합산전력" stroke="#ef4444" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '1rem', fontSize: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '12px', height: '4px', backgroundColor: '#ef4444', borderRadius: '2px', display: 'inline-block' }}></span>
            <span>⚡ 실시간 총 합산 전력: <strong style={{color: '#ef4444'}}>{currentPower.toFixed(2)} mW</strong></span>
          </div>
        </div>
      </div>

      {/* Controls Container */}
      <div style={{
        background: 'rgba(22, 24, 30, 0.7)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '20px',
        padding: '2rem',
        marginBottom: '2rem',
        backdropFilter: 'blur(12px)'
      }}>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '1.5rem' }}>🎛️ 수동 장치 제어 (Manual Override)</h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: window.innerWidth > 992 ? '1fr 1fr 1fr 1fr' : '1fr',
          gap: '1rem'
        }}>
          <button 
            className="btn" 
            style={{ 
              borderColor: lightState ? '#fbd604' : 'rgba(255,255,255,0.08)', 
              color: lightState ? '#fbd604' : '#f5f6f8',
              justifyContent: 'center'
            }}
            onClick={handleLightToggle}
          >
            💡 거실 조명 {lightState ? '끄기 (현재 ON)' : '켜기 (현재 OFF)'}
          </button>
          
          <button 
            className="btn" 
            style={{ 
              borderColor: tvState ? '#fbd604' : 'rgba(255,255,255,0.08)', 
              color: tvState ? '#fbd604' : '#f5f6f8',
              justifyContent: 'center'
            }}
            onClick={handleTvToggle}
          >
            📺 TV {tvState ? '차단 (현재 ON)' : '공급 (현재 OFF)'}
          </button>

          <button 
            className="btn" 
            style={{ 
              borderColor: blindState ? '#fbd604' : 'rgba(255,255,255,0.08)', 
              color: blindState ? '#fbd604' : '#f5f6f8',
              justifyContent: 'center'
            }}
            onClick={handleBlindToggle}
          >
            ⛺ 블라인드 {blindState ? '내리기 (현재 올림)' : '올리기 (현재 내림)'}
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
            <button 
              className="btn" 
              style={{ 
                borderColor: acState ? '#06b6d4' : 'rgba(255,255,255,0.08)', 
                color: acState ? '#06b6d4' : '#f5f6f8',
                justifyContent: 'center',
                width: '100%'
              }}
              onClick={handleAcToggle}
            >
              ❄️ 에어컨 {acState ? '끄기' : '켜기'}
            </button>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '0.4rem',
                flex: 1
              }}>
                <span style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 600, marginBottom: '2px' }}>
                  현재 온도 {isRealTemp && <span style={{ color: '#10b981', fontSize: '0.65rem' }}>● BME280</span>}
                </span>
                <span style={{ color: '#f5f6f8', fontWeight: 700, fontSize: '0.95rem' }}>🌡️ {currentTemp.toFixed(1)}°C</span>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '0.4rem 0.5rem',
                flex: 1.2
              }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: '#64748b', fontSize: '0.7rem', fontWeight: 600, marginBottom: '2px' }}>희망 온도</span>
                  <span style={{ color: '#06b6d4', fontWeight: 700, fontSize: '0.95rem' }}>🎯 {acTemp}°C</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <button 
                    style={{
                      background: 'none',
                      border: 'none',
                      color: acState ? '#06b6d4' : '#64748b',
                      cursor: acState ? 'pointer' : 'default',
                      fontSize: '0.7rem',
                      padding: '0 2px',
                      lineHeight: 1
                    }}
                    onClick={() => handleTempChange(1)}
                    disabled={!acState}
                  >
                    ▲
                  </button>
                  <button 
                    style={{
                      background: 'none',
                      border: 'none',
                      color: acState ? '#06b6d4' : '#64748b',
                      cursor: acState ? 'pointer' : 'default',
                      fontSize: '0.7rem',
                      padding: '0 2px',
                      lineHeight: 1
                    }}
                    onClick={() => handleTempChange(-1)}
                    disabled={!acState}
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SQLite Logs Section */}
      <div style={{
        background: 'rgba(22, 24, 30, 0.7)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '20px',
        padding: '2rem',
        marginBottom: '2rem',
        backdropFilter: 'blur(12px)'
      }}>
        <h3 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.25rem' }}>
          🗄️ 데이터베이스 실시간 연동 로그
        </h3>
        <p style={{ color: '#9aa0a6', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          시스템 제어 내역 및 가상 IoT 디바이스 로그들이 Supabase 클라우드 데이터베이스에 즉각 누적 및 동기화됩니다.
        </p>

        {/* Database logs table */}
        <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={{ padding: '0.75rem 1rem', color: '#9aa0a6' }}>기록 시간</th>
                <th style={{ padding: '0.75rem 1rem', color: '#9aa0a6' }}>장치명</th>
                <th style={{ padding: '0.75rem 1rem', color: '#9aa0a6' }}>이벤트</th>
                <th style={{ padding: '0.75rem 1rem', color: '#9aa0a6' }}>세부 로그</th>
              </tr>
            </thead>
            <tbody>
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: '#9aa0a6' }}>
                    데이터베이스에서 로그를 불러오고 있습니다...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: '#9aa0a6' }}>
                    누적된 로그 데이터가 없습니다. 위의 버튼을 눌러 로그를 추가해 보세요.
                  </td>
                </tr>
              ) : (
                logs.map((log, index) => (
                  <tr 
                    key={index} 
                    style={{ 
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      backgroundColor: index % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'
                    }}
                  >
                    <td style={{ padding: '0.75rem 1rem', color: '#f5f6f8' }}>{log.timestamp}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#fbd604', fontWeight: 600 }}>{log.device_name}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#f5f6f8' }}>{log.event_type}</td>
                    <td style={{ padding: '0.75rem 1rem', color: '#9aa0a6' }}>{log.details}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Clear Logs Accordion */}
        <div style={{ marginTop: '1.5rem' }}>
          <details style={{
            background: 'rgba(0,0,0,0.15)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: '8px',
            padding: '0.75rem 1rem'
          }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#ff4d4d' }}>
              ⚠️ 데이터베이스 관리 메뉴 (개발자용)
            </summary>
            <div style={{ marginTop: '0.75rem' }}>
              <button 
                className="btn btn-secondary" 
                style={{ borderColor: '#ff4d4d', color: '#ff4d4d' }}
                onClick={handleClearLogs}
              >
                데이터베이스 로그 초기화 (Clear Logs Table)
              </button>
              <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '1rem' }}>
                클라우드 Supabase DB의 iot_logs 테이블 내용을 완전히 지우고 초기화합니다.
              </span>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
