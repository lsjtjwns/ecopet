import React, { useState, useEffect } from 'react';

const API_BASE = window.location.hostname === 'localhost' ? 'http://127.0.0.1:8000' : '';

export default function App() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lightState, setLightState] = useState(false);
  const [tvState, setTvState] = useState(false);
  const [blindState, setBlindState] = useState(true); // true = Up/열림, false = Down/닫힘
  const [petPresent, setPetPresent] = useState(true);

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

  useEffect(() => {
    initDb();
    // Poll logs every 5 seconds for updates
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  // Toggle handlers
  const handleLightToggle = async () => {
    const newState = !lightState;
    setLightState(newState);
    const statusStr = newState ? 'ON' : 'OFF';
    
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
    
    try {
      await fetch(`${API_BASE}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_name: "스마트 TV 아울렛",
          event_type: "수동 제어",
          details: `관리자가 스마트 TV 전원을 ${statusStr}(으)로 수동 전환함`
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
    
    try {
      await fetch(`${API_BASE}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_name: "스마트 블라인드",
          event_type: "수동 제어",
          details: `관리자가 블라인드를 ${statusStr} 상태로 수동 전환함`
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

  // Generate 12 hours of power data for the custom SVG chart
  const getPowerChartData = () => {
    const hours = [];
    const tvVals = [];
    const lightVals = [];
    
    const now = new Date();
    const currentHour = now.getHours();

    for (let i = 12; i >= 0; i--) {
      const targetHour = (currentHour - i + 24) % 24;
      hours.push(`${String(targetHour).padStart(2, '0')}:00`);

      if (i === 0) {
        // Current hour values based on state
        tvVals.push(tvState ? 120 : 0);
        lightVals.push(lightState ? 30 : 0);
      } else {
        // Simulated history
        if (i > 4) {
          // Pet awake (high usage)
          tvVals.push(115 + (i % 3) * 5); // ~120W
          lightVals.push(28 + (i % 2) * 2);  // ~30W
        } else {
          // Pet sleeping (low usage)
          tvVals.push(0);
          lightVals.push(4 + (i % 2) * 1);    // ~5W
        }
      }
    }
    return { hours, tvVals, lightVals };
  };

  const chartData = getPowerChartData();

  // Rendering the SVG line chart points
  const renderSvgChart = () => {
    const width = 600;
    const height = 180;
    const padding = 30;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    const maxVal = 140; // Max Watts
    
    // Scale helper
    const getX = (index) => padding + (index / 12) * chartWidth;
    const getY = (val) => height - padding - (val / maxVal) * chartHeight;

    // Build SVG path
    let tvPath = "";
    let lightPath = "";
    
    chartData.tvVals.forEach((val, index) => {
      const x = getX(index);
      const y = getY(val);
      if (index === 0) {
        tvPath += `M ${x} ${y}`;
      } else {
        tvPath += ` L ${x} ${y}`;
      }
    });

    chartData.lightVals.forEach((val, index) => {
      const x = getX(index);
      const y = getY(val);
      if (index === 0) {
        lightPath += `M ${x} ${y}`;
      } else {
        lightPath += ` L ${x} ${y}`;
      }
    });

    return (
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" className="svg-chart">
        {/* Horizontal gridlines */}
        {[0, 50, 100, 140].map((gridVal) => (
          <g key={gridVal}>
            <line 
              x1={padding} 
              y1={getY(gridVal)} 
              x2={width - padding} 
              y2={getY(gridVal)} 
              stroke="rgba(255,255,255,0.06)" 
              strokeWidth="1" 
            />
            <text 
              x={padding - 8} 
              y={getY(gridVal) + 4} 
              fill="#64748b" 
              fontSize="9" 
              textAnchor="end"
            >
              {gridVal}W
            </text>
          </g>
        ))}

        {/* X Axis Labels */}
        {[0, 3, 6, 9, 12].map((idx) => (
          <text
            key={idx}
            x={getX(idx)}
            y={height - 10}
            fill="#64748b"
            fontSize="9"
            textAnchor="middle"
          >
            {chartData.hours[idx]}
          </text>
        ))}

        {/* TV Line */}
        <path d={tvPath} fill="none" stroke="#fbd604" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Light Line */}
        <path d={lightPath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* TV Nodes */}
        {chartData.tvVals.map((val, index) => (
          <circle key={`tv-node-${index}`} cx={getX(index)} cy={getY(val)} r="3" fill="#fbd604" />
        ))}
        {/* Light Nodes */}
        {chartData.lightVals.map((val, index) => (
          <circle key={`light-node-${index}`} cx={getX(index)} cy={getY(val)} r="2.5" fill="#10b981" />
        ))}
      </svg>
    );
  };

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
          <div style={{ position: 'relative', width: '100%', overflow: 'hidden', borderRadius: '12px' }}>
            <img 
              src="/sleeping_dog.jpg" 
              alt="CCTV 모니터링 피드" 
              style={{ width: '100%', display: 'block', objectFit: 'cover' }}
            />
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
          🔌 실시간 가전 기기 전력 사용량 추이 (최근 12시간)
        </h3>
        <p style={{ color: '#9aa0a6', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          방석의 안착 상태(수면 진입)에 따라 거실 TV 전력 공급이 자동 차단되고 거실 조도가 억제되어 에너지가 절감되는 전력 추이 그래프입니다.
        </p>
        
        {/* Custom SVG Line Chart */}
        <div style={{ backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: '12px', padding: '1rem' }}>
          {renderSvgChart()}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '1rem', fontSize: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '12px', height: '4px', backgroundColor: '#fbd604', borderRadius: '2px', display: 'inline-block' }}></span>
            <span>스마트 TV (Max 120W)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '12px', height: '4px', backgroundColor: '#10b981', borderRadius: '2px', display: 'inline-block' }}></span>
            <span>거실 조명 (Max 30W)</span>
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
          gridTemplateColumns: window.innerWidth > 992 ? '1fr 1fr 1fr 1.2fr' : '1fr',
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
            📺 스마트 TV {tvState ? '차단 (현재 ON)' : '공급 (현재 OFF)'}
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

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className="btn btn-secondary" 
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={handleSimulate}
            >
              ⚡ 가상 로그 생성
            </button>
            <button 
              className="btn" 
              style={{ 
                borderColor: petPresent ? '#10b981' : 'rgba(255,255,255,0.08)',
                color: petPresent ? '#10b981' : '#fbd604',
                padding: '0.75rem' 
              }}
              onClick={() => setPetPresent(!petPresent)}
            >
              🐾 {petPresent ? "부재 중" : "안착함"}
            </button>
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
