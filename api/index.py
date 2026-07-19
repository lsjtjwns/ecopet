from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from datetime import datetime
import random
import os

app = FastAPI()

# CORS configuration (allows React frontend to query this API during development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = "https://jxauevydtcymamfefekc.supabase.co"
SUPABASE_KEY = "sb_publishable_4s4bqYB3b4WW4px73RK-FQ_bL26aVw1"
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

class LogRequest(BaseModel):
    device_name: str
    event_type: str
    details: str

@app.get("/api/logs")
def get_logs():
    try:
        response = supabase.table("iot_logs").select("timestamp, device_name, event_type, details").order("id", desc=True).limit(100).execute()
        return response.data if response.data else []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/logs")
def add_log(req: LogRequest):
    try:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        response = supabase.table("iot_logs").insert({
            "timestamp": now,
            "device_name": req.device_name,
            "event_type": req.event_type,
            "details": req.details
        }).execute()
        return {"status": "success", "data": response.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/logs")
def clear_logs():
    try:
        # Delete all logs in Supabase
        supabase.table("iot_logs").delete().gt("id", 0).execute()
        # Seed default initialization log
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        supabase.table("iot_logs").insert({
            "timestamp": now,
            "device_name": "시스템 메인",
            "event_type": "초기화",
            "details": "데이터베이스 모든 로그 수동 삭제 완료 (초기화)"
        }).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/simulate")
def simulate_log():
    try:
        telemetry_events = [
            ("방석 센서", "상태변경", "반려견 자세 움직임 미세 감지"),
            ("온습도 센서", "측정", f"스마트 침대 주변 온도 측정 완료 (현재 온도: {round(random.uniform(22.0, 24.5), 1)}°C)"),
            ("스마트 가습기", "동작", "실내 습도 저하 감지 -> 가습기 자동 가동 개시"),
            ("에너지 매니저", "전력보고", f"대기전력 자동 최적화 차단 완료 (누적 절약량 +{random.randint(15, 60)}Wh 추가)"),
            ("스마트 사료기", "급식완료", "반려견 취침 전 스마트 저녁 급식 배급 완료 (80g)"),
        ]
        event = random.choice(telemetry_events)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        response = supabase.table("iot_logs").insert({
            "timestamp": now,
            "device_name": event[0],
            "event_type": event[1],
            "details": event[2]
        }).execute()
        return {"status": "success", "event": event[0], "details": event[2]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/init_db")
def init_db():
    try:
        # Query if empty
        response = supabase.table("iot_logs").select("id", count="exact").limit(1).execute()
        if response.count == 0:
            seed_data = [
                {"timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "device_name": "시스템 메인", "event_type": "부팅", "details": "Eco-Pet Care IoT 게이트웨이 구동 완료"},
                {"timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "device_name": "스마트 조명", "event_type": "상태변경", "details": "조명 자동 제어 활성화 (주변 밝기 감지)"},
                {"timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "device_name": "방석 센서", "event_type": "측정", "details": "반려견 감지 시작 (착석 감지 모드 활성화)"},
                {"timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "device_name": "방석 센서", "event_type": "상태변경", "details": "반려견 방석 안착 감지 (상태: 안착함)"},
                {"timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "device_name": "에너지 매니저", "event_type": "전력차단", "details": "반려견 수면 상태 진입 감지 -> 거실 TV 대기전력 차단"},
                {"timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "device_name": "스마트 조명", "event_type": "밝기조절", "details": "반려견 수면 유도를 위한 스마트 조명 조도 감소 (10% 조광)"},
            ]
            supabase.table("iot_logs").insert(seed_data).execute()
            return {"status": "seeded"}
        return {"status": "already_initialized"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
