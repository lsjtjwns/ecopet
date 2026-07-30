import React, { useState, useEffect, useRef } from 'react';
import mqtt from 'mqtt';
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Line } from 'recharts';

// 버전: 웹 수정 시마다 올려서 Vercel 배포 반영 여부를 즉시 확인
const APP_VERSION = 'v1.5.1';

// Supabase Direct REST API credentials for 100% reliable logging in any environment
const SUPABASE_URL = "https://jxauevydtcymamfefekc.supabase.co";
const SUPABASE_KEY = "sb_publishable_4s4bqYB3b4WW4px73RK-FQ_bL26aVw1";

export default function App() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  // ── 장치 상태: localStorage에서 복원 (새로고침 후에도 유지) ──
  const [lightState, setLightState] = useState(() => localStorage.getItem('lightState') === 'true');
  const [tvState, setTvState] = useState(() => localStorage.getItem('tvState') === 'true');
  const [blindState, setBlindState] = useState(() => localStorage.getItem('blindState') !== 'false'); // 기본 true(열림)
  const [acState, setAcState] = useState(() => localStorage.getItem('acState') === 'true');
  const [acTemp, setAcTemp] = useState(() => Number(localStorage.getItem('acTemp')) || 24);

  const [currentTemp, setCurrentTemp] = useState(22.5);
  const [petPresent, setPetPresent] = useState(true);
  const [currentPower, setCurrentPower] = useState(0.0);
  const [deviceId, setDeviceId] = useState('');
  const [mqttConnected, setMqttConnected] = useState(false); // MQTT 연결 상태 표시용

  const mqttClientRef = useRef(null);

  // 5분 간격 (300초 데이터) 실시간 전력 그래프 히스토리 초기화
  const [powerHistory, setPowerHistory] = useState(() => {
    const data = [];
    const now = Date.now();
    for (let i = 299; i >= 0; i--) {
      const time = new Date(now - i * 1000);
      const m = time.getMinutes();
      const s = time.getSeconds();
      data.push({
        name: `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`,
        총합산전력: 0
      });
    }
    return data;
  });

  // 에어컨 희망 온도 (18°C ~ 30°C) -> 쿨링 팬 PWM 속도 (255 ~ 0) 매핑
  const calculateFanSpeed = (temp) => {
    const minPWM = 0;   // 30°C -> PWM 0 (완전 정지)
    const maxPWM = 255; // 18°C -> PWM 255 (최대 속도)
    const minTemp = 18;
    const maxTemp = 30;
    const ratio = (temp - minTemp) / (maxTemp - minTemp);
    const speed = Math.round(maxPWM - (ratio * (maxPWM - minPWM)));
    return Math.max(minPWM, Math.min(maxPWM, speed));
  };

  // -------------------------------------------------------------
  // Supabase 클라우드 데이터베이스 전용 로그 처리 함수
  // -------------------------------------------------------------
  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${SUPABASE_URL}/rest/v1/iot_logs?select=timestamp,device_name,event_type,details&order=id.desc&limit=100`, {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setLogs(data);
      }
    } catch (e) {
      console.error("Supabase fetchLogs error:", e);
    } finally {
      setLoading(false);
    }
  };

  const addLog = (device_name, event_type, details) => {
    // Supabase 로그 저장을 비블로킹(fire-and-forget) 처리하여 버튼 클릭 딜레이 0ms로 단축
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
    fetch(`${SUPABASE_URL}/rest/v1/iot_logs`, {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify({
        timestamp: nowStr,
        device_name,
        event_type,
        details
      })
    }).then(() => fetchLogs()).catch(e => console.error("Supabase addLog error:", e));
  };

  const handleClearLogs = async () => {
    if (!window.confirm("정말로 데이터베이스의 모든 로그를 초기화하시겠습니까?")) return;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/iot_logs?id=gt.0`, {
        method: 'DELETE',
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`
        }
      });
      const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
      await fetch(`${SUPABASE_URL}/rest/v1/iot_logs`, {
        method: 'POST',
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`
        },
        body: JSON.stringify({
          timestamp: nowStr,
          device_name: "시스템 메인",
          event_type: "초기화",
          details: "데이터베이스 모든 로그 수동 삭제 완료 (초기화)"
        })
      });
      fetchLogs();
    } catch (e) {
      console.error("Supabase clearLogs error:", e);
    }
  };

  // -------------------------------------------------------------
  // MQTT 통신 및 실시간 수신
  // -------------------------------------------------------------
  useEffect(() => {
    fetchLogs();
    const logInterval = setInterval(fetchLogs, 4000);

    const client = mqtt.connect('wss://test.mosquitto.org:8081', {
      reconnectPeriod: 3000,  // 3초마다 자동 재연결
      connectTimeout: 10000,  // 연결 타임아웃 10초
      keepalive: 30,
    });
    mqttClientRef.current = client;

    client.on('connect', () => {
      console.log('[MQTT] 연결 성공: wss://test.mosquitto.org:8081');
      setMqttConnected(true);
      client.subscribe('xiao/+/motion', { qos: 0 });
      client.subscribe('xiao/+/temp', { qos: 0 });
      client.subscribe('xiao/+/power', { qos: 0 });
    });

    client.on('disconnect', () => setMqttConnected(false));
    client.on('offline', () => setMqttConnected(false));
    client.on('reconnect', () => console.log('[MQTT] 재연결 시도 중...'));

    client.on('message', (topic, payload) => {
      const payloadStr = payload.toString();

      // 디바이스 MAC/ID 자동 추출
      const parts = topic.split('/');
      if (parts.length >= 2 && parts[1] !== 'all') {
        setDeviceId(parts[1]);
      }

      // PIR 센서 안착/부재 (1: 수면/안착, 0: 부재)
      if (topic.includes('/motion')) {
        setPetPresent(payloadStr === '1');
      }

      // 실시간 온도 수신
      if (topic.includes('/temp')) {
        const tVal = parseFloat(payloadStr);
        if (!isNaN(tVal) && tVal > -50 && tVal < 100) {
          setCurrentTemp(tVal);
        }
      }

      // INA219 실시간 합산 전력(mW) 수신 및 그래프 차트 실시간 갱신
      if (topic.includes('/power')) {
        const pwrVal = parseFloat(payloadStr);
        if (!isNaN(pwrVal) && pwrVal >= 0) {
          setCurrentPower(pwrVal);
          setPowerHistory(prev => {
            const time = new Date();
            const m = time.getMinutes();
            const s = time.getSeconds();
            const timeStr = `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
            const newHistory = [...prev, { name: timeStr, 총합산전력: Math.round(pwrVal * 100) / 100 }];
            if (newHistory.length > 300) newHistory.shift();
            return newHistory;
          });
        }
      }
    });

    return () => {
      clearInterval(logInterval);
      client.end();
    };
  }, []);

  // MQTT 제어 명령 전송 헬퍼 함수
  // connected 체크 없이 publish → 라이브러리가 내부 큐에 쌓고 재연결 시 자동 전송
  const sendMqttCommand = (device, payload) => {
    const payloadStr = String(payload);
    const topic = `xiao/all/${device}/set`;
    if (mqttClientRef.current) {
      mqttClientRef.current.publish(topic, payloadStr, { qos: 0 }, (err) => {
        if (err) console.error('[MQTT] publish 실패:', err);
        else console.log(`[MQTT] 발행: ${topic} -> ${payloadStr}`);
      });
    } else {
      console.warn('[MQTT] 클라이언트 미초기화');
    }
  };

  // -------------------------------------------------------------
  // 수동 장치 제어 핸들러
  // -------------------------------------------------------------
  const handleLightToggle = () => {
    const newState = !lightState;
    setLightState(newState);
    localStorage.setItem('lightState', newState);
    const statusStr = newState ? 'ON' : 'OFF';
    sendMqttCommand('led', statusStr);
    addLog("스마트 조명", "수동 제어", `관리자가 거실 조명을 ${statusStr}(으)로 수동 전환함`);
  };

  const handleTvToggle = () => {
    const newState = !tvState;
    setTvState(newState);
    localStorage.setItem('tvState', newState);
    const statusStr = newState ? 'ON' : 'OFF';
    sendMqttCommand('oled', statusStr);
    addLog("TV", "수동 제어", `관리자가 TV 전원을 ${statusStr}(으)로 수동 전환함`);
  };

  const handleBlindToggle = () => {
    const newState = !blindState;
    setBlindState(newState);
    localStorage.setItem('blindState', newState);
    const statusStr = newState ? '올림 (열림)' : '내림 (닫힘)';
    sendMqttCommand('servo', newState ? '90' : '0');
    addLog("블라인드", "수동 제어", `관리자가 블라인드를 ${statusStr} 상태로 수동 전환함`);
  };

  const handleAcToggle = () => {
    const newState = !acState;
    setAcState(newState);
    localStorage.setItem('acState', newState);
    const statusStr = newState ? 'ON' : 'OFF';
    sendMqttCommand('fan', statusStr);
    addLog("에어컨", "수동 제어", `관리자가 에어컨 전원을 ${statusStr}(으)로 수동 전환함`);
  };

  const handleTempChange = (diff) => {
    if (!acState) return;
    const newTemp = acTemp + diff;
    if (newTemp < 18 || newTemp > 30) return;
    setAcTemp(newTemp);
    localStorage.setItem('acTemp', newTemp);
    const pwmVal = calculateFanSpeed(newTemp);
    sendMqttCommand('fan', pwmVal.toString());
    addLog("에어컨", "온도 설정", `관리자가 에어컨 설정 온도를 ${newTemp}°C로 변경함 (PWM: ${pwmVal})`);
  };

  // -------------------------------------------------------------
  // UI JSX 렌더링
  // -------------------------------------------------------------
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
        boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)',
        position: 'relative'
      }}>
        {/* 우상단 뱃지 묶음 */}
        <div style={{ position: 'absolute', top: '1rem', right: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* MQTT 연결 상태 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            background: mqttConnected ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
            border: `1px solid ${mqttConnected ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)'}`,
            borderRadius: '999px', padding: '0.25rem 0.75rem',
          }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: mqttConnected ? '#10b981' : '#ef4444', display: 'inline-block', animation: mqttConnected ? 'none' : 'fadeIn 1s infinite alternate' }}></span>
            <span style={{ color: mqttConnected ? '#10b981' : '#ef4444', fontSize: '0.78rem', fontWeight: 700, fontFamily: 'monospace' }}>
              {mqttConnected ? 'MQTT ●' : 'MQTT ○'}
            </span>
          </div>
          {/* 버전 뱃지 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            background: 'rgba(100,116,139,0.15)', border: '1px solid rgba(100,116,139,0.3)',
            borderRadius: '999px', padding: '0.25rem 0.75rem',
          }}>
            <span style={{ color: '#94a3b8', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.05em', fontFamily: 'monospace' }}>{APP_VERSION}</span>
          </div>
        </div>
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
              src="/sleeping_dog.jpg" 
              alt="CCTV 모니터링 피드" 
              style={{ width: '100%', height: '380px', objectFit: 'cover', display: 'block' }}
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
              ● LIVE SMART PET BED MONITORING
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
                  현재 온도 <span style={{ color: '#10b981', fontSize: '0.65rem' }}>● BMP280</span>
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

      {/* Database Logs Section */}
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
