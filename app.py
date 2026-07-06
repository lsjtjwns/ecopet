import streamlit as st
import sqlite3
import pandas as pd
from datetime import datetime
import os
import random

# Page Config
st.set_page_config(
    page_title="Eco-Pet Care Smart IoT Dashboard",
    page_icon="🌱",
    layout="wide",
    initial_sidebar_state="expanded"
)

# SQLite DB Helper
DB_FILE = "eco_pet_care.db"

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    # Create logs table if not exists
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS iot_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            device_name TEXT NOT NULL,
            event_type TEXT NOT NULL,
            details TEXT NOT NULL
        )
    """)
    conn.commit()
    
    # Check if empty, seed some initial logs
    cursor.execute("SELECT COUNT(*) FROM iot_logs")
    count = cursor.fetchone()[0]
    if count == 0:
        seed_data = [
            (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "시스템 메인", "부팅", "Eco-Pet Care IoT 게이트웨이 구동 완료"),
            (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "스마트 조명", "상태변경", "조명 자동 제어 활성화 (주변 밝기 감지)"),
            (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "방석 센서", "측정", "반려견 감지 시작 (착석 감지 모드 활성화)"),
            (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "방석 센서", "상태변경", "반려견 방석 안착 감지 (상태: 안착함)"),
            (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "에너지 매니저", "전력차단", "반려견 수면 상태 진입 감지 -> 거실 TV 대기전력 차단"),
            (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "스마트 조명", "밝기조절", "반려견 수면 유도를 위한 스마트 조명 조도 감소 (10% 조광)"),
        ]
        cursor.executemany("INSERT INTO iot_logs (timestamp, device_name, event_type, details) VALUES (?, ?, ?, ?)", seed_data)
        conn.commit()
    conn.close()

def add_log(device_name, event_type, details):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cursor.execute(
        "INSERT INTO iot_logs (timestamp, device_name, event_type, details) VALUES (?, ?, ?, ?)",
        (now, device_name, event_type, details)
    )
    conn.commit()
    conn.close()

def get_logs():
    conn = get_db_connection()
    df = pd.read_sql_query("SELECT timestamp as '기록 시간', device_name as '장치명', event_type as '이벤트', details as '세부 로그' FROM iot_logs ORDER BY id DESC", conn)
    conn.close()
    return df

def clear_all_logs():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM iot_logs")
    conn.commit()
    conn.close()

def get_power_data():
    times = []
    tv_power = []
    light_power = []
    now_hour = datetime.now().hour
    
    # Generate last 12 hours of data
    for i in range(12, -1, -1):
        target_hour = (now_hour - i) % 24
        times.append(f"{target_hour:02d}:00")
        
        if i == 0:
            # Current state based on live dashboard state toggles
            tv = 120.0 if st.session_state.tv_state else 0.0
            light = 30.0 if st.session_state.light_state else 0.0
        else:
            # Simulated history: pet sleeps 4 hours ago, auto cuts power
            if i > 4:
                tv = round(random.uniform(115.0, 125.0), 1)
                light = round(random.uniform(28.0, 32.0), 1)
            else:
                tv = 0.0
                light = round(random.uniform(4.0, 6.0), 1)
                
        tv_power.append(tv)
        light_power.append(light)
        
    df = pd.DataFrame({
        "시간": times,
        "스마트 TV (W)": tv_power,
        "거실 조명 (W)": light_power
    })
    df.set_index("시간", inplace=True)
    return df

# Initialize DB and Seed Data
init_db()

# State Management for Manual Controls
if 'light_state' not in st.session_state:
    st.session_state.light_state = False
if 'tv_state' not in st.session_state:
    st.session_state.tv_state = False
if 'pet_present' not in st.session_state:
    st.session_state.pet_present = True

# Header Design
st.markdown("""
    <div style='background-color: #1E293B; padding: 2rem; border-radius: 16px; margin-bottom: 2rem; border-left: 8px solid #10B981;'>
        <h1 style='color: white; margin: 0; font-size: 2.2rem;'>🌱 Eco-Pet Care Smart Home IoT Dashboard</h1>
        <p style='color: #94A3B8; margin: 0.5rem 0 0 0; font-size: 1.1rem;'>
            반려동물의 <b>실시간 행동 상태(수면/부재)</b> 및 <b>스마트 방석 착석 여부</b> 감지 데이터를 분석하여 가전기기 대기전력을 자동으로 제어하는 스마트 홈 전력 최적화 솔루션입니다.
        </p>
    </div>
""", unsafe_allow_html=True)

# Layout Setup: 2 Columns
col_left, col_right = st.columns([1.2, 1])

# Left Column: CCTV Dog Monitoring
with col_left:
    st.markdown("### 📹 CCTV 모니터링 피드")
    
    # Blinking REC dot styling
    st.markdown("""
        <div style='display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; background-color: #0F172A; padding: 0.5rem 1rem; border-radius: 8px; width: fit-content; border: 1px solid #334155;'>
            <span style='height: 10px; width: 10px; background-color: #EF4444; border-radius: 50%; display: inline-block; animation: blinker 1s linear infinite;'></span>
            <span style='color: #F8FAFC; font-weight: 700; font-size: 0.85rem;'>LIVE REC [1080P]</span>
            <span style='color: #64748B; font-size: 0.8rem; margin-left: 0.5rem;'>| 거실 스마트 펫 침대</span>
        </div>
        <style>
            @keyframes blinker {
                50% { opacity: 0; }
            }
        </style>
    """, unsafe_allow_html=True)
    
    # Render Generated Dog Image
    if os.path.exists("sleeping_dog.jpg"):
        st.image("sleeping_dog.jpg", caption="CCTV-01 스마트 펫 침대 실시간 캠", use_container_width=True)
    else:
        # Fallback colored box if image copy is still in progress
        st.info("CCTV 피드 이미지를 불러오는 중입니다...")

# Right Column: Metrics and Parameters
with col_right:
    st.markdown("### 📊 현재 스마트홈 IoT 상태")
    
    # Metric Rows
    st.metric(
        label="⚡ 스마트홈 제어 상태",
        value="수면 중 (에너지 절감 모드)",
        delta="절감 알고리즘 작동 중",
        delta_color="normal"
    )
    
    st.markdown("---")
    
    if st.session_state.pet_present:
        st.metric(
            label="⚖️ 스마트 방석 센서 상태",
            value="안착함",
            delta="반려견 재실 감지됨",
            delta_color="normal"
        )
    else:
        st.metric(
            label="⚖️ 스마트 방석 센서 상태",
            value="미안착",
            delta="반려견 부재 중 (대기)",
            delta_color="inverse"
        )
    
    st.markdown("---")
    
    st.metric(
        label="💰 이번 달 누적 절약 전기 요금",
        value="₩ 12,500",
        delta="+₩ 1,200 (어제 대기전력 차단 대비)",
        delta_color="normal"
    )

st.markdown("<br>", unsafe_allow_html=True)

# Power Consumption Graph Section
st.markdown("### 🔌 실시간 가전 기기 전력 사용량 추이 (최근 12시간)")
st.caption("방석의 안착 상태(수면 진입)에 따라 거실 TV 전력 공급이 자동 차단되고 거실 조도가 억제되어 에너지가 절감되는 전력 추이 그래프입니다.")
power_df = get_power_data()
st.line_chart(power_df)

st.markdown("<br>", unsafe_allow_html=True)

# System Controls (Manual Override)
st.markdown("### 🎛️ 수동 장치 제어 (Manual Override)")
ctrl_col1, ctrl_col2, ctrl_col3 = st.columns(3)

with ctrl_col1:
    light_btn_label = "💡 거실 조명 끄기 (현재 ON)" if st.session_state.light_state else "💡 거실 조명 켜기 (현재 OFF)"
    if st.button(light_btn_label, use_container_width=True):
        st.session_state.light_state = not st.session_state.light_state
        status_str = "ON" if st.session_state.light_state else "OFF"
        add_log("스마트 조명", "수동 제어", f"관리자가 거실 조명을 {status_str}(으)로 수동 전환함")
        st.success(f"거실 조명이 {status_str} 상태로 변경되었습니다.")
        st.rerun()

with ctrl_col2:
    tv_btn_label = "📺 스마트 TV 전원 차단 (현재 ON)" if st.session_state.tv_state else "📺 스마트 TV 전원 공급 (현재 OFF)"
    if st.button(tv_btn_label, use_container_width=True):
        st.session_state.tv_state = not st.session_state.tv_state
        status_str = "ON" if st.session_state.tv_state else "OFF"
        add_log("스마트 TV 아울렛", "수동 제어", f"관리자가 스마트 TV 전원을 {status_str}(으)로 수동 전환함")
        st.success(f"스마트 TV 콘센트가 {status_str} 상태로 변경되었습니다.")
        st.rerun()

with ctrl_col3:
    # Simulate Telemetry Event Button for Hackathon Judges
    if st.button("⚡ 가상 센서 로그 생성 (심사위원 테스트용)", use_container_width=True, type="secondary"):
        telemetry_events = [
            ("방석 센서", "상태변경", "반려견 자세 움직임 미세 감지"),
            ("온습도 센서", "측정", f"스마트 침대 주변 온도 측정 완료 (현재 온도: {round(random.uniform(22.0, 24.5), 1)}°C)"),
            ("스마트 가습기", "동작", "실내 습도 저하 감지 -> 가습기 자동 가동 개시"),
            ("에너지 매니저", "전력보고", f"대기전력 자동 최적화 차단 완료 (누적 절약량 +{random.randint(15, 60)}Wh 추가)"),
            ("스마트 사료기", "급식완료", "반려견 취침 전 스마트 저녁 급식 배급 완료 (80g)"),
        ]
        event = random.choice(telemetry_events)
        add_log(event[0], event[1], event[2])
        st.toast(f"새 가상 로그 생성 완료: {event[0]} - {event[2]}", icon="📝")
        st.rerun()

st.markdown("<br>", unsafe_allow_html=True)

# SQLite Real-time Logs Table Section
st.markdown("### 🗄️ SQLite 데이터베이스 실시간 연동 로그")
st.caption("해커톤 대면 평가 전 필수 연동 항목: 시스템 제어 내역 및 가상 IoT 디바이스 로그들이 SQLite DB 테이블에 즉각 누적 및 동기화됩니다.")

# Load logs
logs_df = get_logs()
st.dataframe(logs_df, use_container_width=True, height=280)

# Clear logs button
with st.expander("⚠️ 데이터베이스 관리 메뉴 (개발자용)"):
    if st.button("데이터베이스 로그 초기화 (Clear Logs Table)"):
        clear_all_logs()
        add_log("시스템 메인", "초기화", "데이터베이스 모든 로그 수동 삭제 완료")
        st.warning("데이터베이스의 모든 로그가 지워졌습니다. (초기 부팅 로그만 다시 생성됨)")
        st.rerun()
