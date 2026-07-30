// Seeed XIAO ESP32S3 - WiFi STA + MQTT: touch sensor publish + LED control + PIR Sleep State Machine
// Multiple boards can run this exact sketch unmodified after templating:
// each one derives a unique device ID from its own MAC address, so topics
// never collide even when the same firmware is flashed to many boards.
#include <WiFi.h>
#include <WiFiClient.h>
#include <PubSubClient.h>

const char* WIFI_SSID = "seojun";
const char* WIFI_PASSWORD = "35320300";

// LAN IP of the machine running the MQTT broker (Mosquitto). DHCP-assigned
// IPs can change on reboot — use a router DHCP reservation if possible.
const char* MQTT_HOST = "broker.emqx.io";
const int MQTT_PORT = 1883;

#define LED_PIN LED_BUILTIN   // GPIO21, inverted: LOW = on, HIGH = off
#define TOUCH_PIN T2          // GPIO2 / D1 (Used in older versions, but keeping logic just in case)
#define TOUCH_THRESHOLD 40000 // touch value RISES above this when touched
#define MOTION_PIN D0         // PIR Motion Sensor
#define RELAY_PIN D1          // 대기 전력 차단용 릴레이 모듈
#define FAN_PIN D1            // MOSFET 팬 제어 핀 (XIAO ESP32S3 D1)

WiFiClient net;
PubSubClient mqtt(net);

char deviceId[13];
char topicTouch[32];
char topicLedSet[32];
char topicLedState[32];
char topicStatus[32];
char topicMotion[32];
char topicFanSetAll[32];
char topicFanSetId[32];

bool ledState = false;
unsigned long lastTouchPublish = 0;
const unsigned long TOUCH_INTERVAL_MS = 500;

// ==========================================
// 스마트홈 수면 모드 상태 머신 (State Machine) 변수
// ==========================================
enum DogState { AWAKE, SLEEP };
DogState currentState = AWAKE; // 초기 상태는 활동(AWAKE)으로 시작

const unsigned long SLEEP_TIMEOUT_MS = 5 * 1000; // 5초 (밀리초)
unsigned long lastMotionTime = 0; // 마지막으로 움직임이 감지된 시간

// 기상(AWAKE) 진입을 위한 채터링(오작동) 방지 변수들
unsigned long firstMotionDetectTime = 0; 
int motionDetectCount = 0;               
unsigned long continuousHighStartTime = 0; 
bool isContinuousHigh = false;           
bool lastPirState = LOW;

void setLed(bool on, bool publishState) {
  ledState = on;
  // Use analogWrite(LED_PIN, 0) for full brightness on ESP32S3 if digitalWrite is too dim
  analogWrite(LED_PIN, on ? 0 : 255);
  if (publishState) {
    mqtt.publish(topicLedState, on ? "ON" : "OFF", true);
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  msg.trim();

  String upperMsg = msg;
  upperMsg.toUpperCase();

  if (String(topic) == topicLedSet || String(topic) == "xiao/all/led/set") {
    if (upperMsg == "ON" || upperMsg == "1" || upperMsg == "TRUE") setLed(true, true);
    else if (upperMsg == "OFF" || upperMsg == "0" || upperMsg == "FALSE") setLed(false, true);
    else if (upperMsg == "TOGGLE") setLed(!ledState, true);
  }
  else if (String(topic) == topicFanSetAll || String(topic) == topicFanSetId || String(topic).endsWith("/fan/set")) {
    if (upperMsg == "OFF" || upperMsg == "0" || upperMsg == "FALSE") {
      analogWrite(FAN_PIN, 0);
      Serial.println("[FAN] OFF (PWM 0)");
    } else {
      int pwm = msg.toInt();
      if (pwm == 0 && (upperMsg == "ON" || upperMsg == "TRUE")) pwm = 255;
      pwm = constrain(pwm, 0, 255);
      analogWrite(FAN_PIN, pwm);
      Serial.printf("[FAN] ON (PWM %d)\n", pwm);
    }
  }
}

void buildTopics() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  snprintf(deviceId, sizeof(deviceId), "%02x%02x%02x", mac[3], mac[4], mac[5]);
  snprintf(topicTouch, sizeof(topicTouch), "xiao/%s/touch", deviceId);
  snprintf(topicLedSet, sizeof(topicLedSet), "xiao/%s/led/set", deviceId);
  snprintf(topicLedState, sizeof(topicLedState), "xiao/%s/led/state", deviceId);
  snprintf(topicStatus, sizeof(topicStatus), "xiao/%s/status", deviceId);
  snprintf(topicMotion, sizeof(topicMotion), "xiao/%s/motion", deviceId);
  snprintf(topicFanSetAll, sizeof(topicFanSetAll), "xiao/all/fan/set");
  snprintf(topicFanSetId, sizeof(topicFanSetId), "xiao/%s/fan/set", deviceId);
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi \"");
  Serial.print(WIFI_SSID);
  Serial.print("\"");
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("WiFi connected, IP: ");
  Serial.println(WiFi.localIP());
}

void connectMqtt() {
  while (!mqtt.connected()) {
    Serial.print("Connecting to MQTT broker ");
    Serial.print(MQTT_HOST);
    Serial.print(" ...");
    String clientId = "xiao-" + String(deviceId);
    if (mqtt.connect(clientId.c_str(), NULL, NULL, topicStatus, 1, true, "offline")) {
      Serial.println(" connected");
      mqtt.subscribe(topicLedSet);
      mqtt.subscribe("xiao/all/led/set");
      mqtt.subscribe(topicFanSetAll);
      mqtt.subscribe(topicFanSetId);
      mqtt.subscribe("xiao/+/fan/set");
      mqtt.publish(topicStatus, "online", true);
      mqtt.publish(topicLedState, ledState ? "ON" : "OFF", true);
    } else {
      Serial.print(" failed, rc=");
      Serial.print(mqtt.state());
      Serial.println(" retrying in 2s");
      delay(2000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(3000);

  pinMode(LED_PIN, OUTPUT);
  analogWrite(LED_PIN, 255); // off
  
  pinMode(MOTION_PIN, INPUT);
  
  // 릴레이 핀 초기화 (초기 상태는 AWAKE이므로 켜짐 유지)
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH);

  connectWiFi();
  buildTopics();
  Serial.print("Device ID: ");
  Serial.println(deviceId);

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  connectMqtt();
  
  // 초기화 시 마지막 움직임 시간을 현재로 설정
  lastMotionTime = millis();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }
  if (!mqtt.connected()) {
    connectMqtt();
  }
  mqtt.loop(); // 백그라운드 웹 통신 유지 (Blocking 방지)

  unsigned long now = millis();
  bool currentPirState = digitalRead(MOTION_PIN);

  // ==========================================
  // [상태 머신] 수면 및 활동 판별 로직
  // ==========================================
  if (currentState == AWAKE) {
    // 1. 활동 상태(AWAKE) 중일 때의 로직
    if (currentPirState == HIGH) {
      // 움직임이 감지되면 15분 수면 타이머를 즉시 0으로 초기화
      lastMotionTime = now;
    } else {
      // 움직임이 감지되지 않은(LOW) 상태가 15분(SLEEP_TIMEOUT_MS) 연속 유지되면
      if (now - lastMotionTime >= SLEEP_TIMEOUT_MS) {
        currentState = SLEEP;
        digitalWrite(RELAY_PIN, LOW); // 릴레이 OFF (대기 전력 완벽 차단)
        
        // 오작동 방지 변수들 초기화 (다음 기상을 위해)
        motionDetectCount = 0;
        isContinuousHigh = false;
        
        Serial.println("상태 변경: 수면(SLEEP) 진입. 릴레이 OFF.");
      }
    }
  } 
  else if (currentState == SLEEP) {
    // 2. 수면 상태(SLEEP) 중일 때의 로직 (오작동/채터링 방지)
    if (currentPirState == HIGH) {
      // (A) 횟수 체크 로직 (최초 감지 후 5초 이내 3회 이상)
      if (lastPirState == LOW) {
        if (motionDetectCount == 0) {
          firstMotionDetectTime = now;
        }
        motionDetectCount++;
      }
      
      // (B) 연속 감지 로직 (3초 이상 연속 HIGH)
      if (!isContinuousHigh) {
        isContinuousHigh = true;
        continuousHighStartTime = now;
      }
      
      // 기상 조건 판별
      bool condition1 = (motionDetectCount >= 3 && (now - firstMotionDetectTime <= 5000));
      bool condition2 = (isContinuousHigh && (now - continuousHighStartTime >= 3000));
      
      if (condition1 || condition2) {
        currentState = AWAKE;
        digitalWrite(RELAY_PIN, HIGH); // 릴레이 ON (전력 공급 재개)
        lastMotionTime = now;          // 15분 타이머 즉시 초기화
        
        Serial.println("상태 변경: 활동(AWAKE) 진입. 릴레이 ON.");
      }
    } else { 
      // LOW로 떨어지면 연속 HIGH 상태는 깨짐
      isContinuousHigh = false;
      
      // 최초 감지 후 5초가 경과했는데도 3회를 못 채웠다면 카운트 무효화 (오작동으로 간주)
      if (motionDetectCount > 0 && (now - firstMotionDetectTime > 5000)) {
        motionDetectCount = 0;
      }
    }
  }
  
  // 다음 루프의 엣지(Edge) 검출을 위해 현재 상태 저장
  lastPirState = currentPirState;

  // ==========================================
  // [웹 대시보드 통신] 상태 퍼블리싱 로직 (0.5초 간격)
  // ==========================================
  if (now - lastTouchPublish >= TOUCH_INTERVAL_MS) {
    lastTouchPublish = now;
    
    uint32_t touchVal = touchRead(TOUCH_PIN);
    char buf[12];
    snprintf(buf, sizeof(buf), "%lu", (unsigned long)touchVal);
    mqtt.publish(topicTouch, buf);

    // 원시(Raw) PIR 센서 값이 아니라, 알고리즘으로 필터링된 상태(AWAKE=1, SLEEP=0)를 전송
    // 이렇게 하면 Vercel 웹 대시보드 쪽에서는 코드 수정 없이 완벽하게 연동됩니다.
    char motionBuf[4];
    snprintf(motionBuf, sizeof(motionBuf), "%d", (currentState == AWAKE) ? 1 : 0);
    mqtt.publish(topicMotion, motionBuf);
  }
}
