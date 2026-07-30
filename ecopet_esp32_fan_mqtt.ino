/*
 * Eco-Pet Smart Home - ESP32 Fan Motor MQTT Control Sketch
 * 
 * Vercel Web App: https://ecopet-two.vercel.app/
 * GitHub Repo: https://github.com/lsjtjwns/ecopet
 * 
 * Hardware Connections (MOSFET):
 * - ESP32 GPIO 18 -> MOSFET Gate (via 1k resistor)
 * - MOSFET Drain  -> Fan Motor (-) Wire
 * - MOSFET Source -> Common GND (ESP32 GND + External Power GND)
 * - Fan Motor (+) -> External Power (+) (e.g., 5V / 12V)
 */

#include <WiFi.h>
#include <WiFiClient.h>
#include <PubSubClient.h>

// ==========================================
// [필수] Wi-Fi 설정 (사용자의 Wi-Fi 정보 입력)
// ==========================================
const char* WIFI_SSID = "YOUR_WIFI_SSID";         // Wi-Fi 이름
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"; // Wi-Fi 비밀번호

// ==========================================
// MQTT 브로커 설정
// Vercel 웹 앱(https://ecopet-two.vercel.app/)은
// wss://test.mosquitto.org:8081 브로커를 사용합니다.
// 노트북 로컬 브로커를 사용할 경우 노트북 IP로 변경하세요.
// ==========================================
const char* MQTT_HOST = "test.mosquitto.org";
const int MQTT_PORT = 1883;

// ==========================================
// 핀 및 PWM 설정
// ==========================================
const int FAN_PIN = 18;        // MOSFET 제어 GPIO 핀
const int PWM_FREQ = 25000;    // 25kHz PWM 주파수 (팬 잡음 감소)
const int PWM_CHANNEL = 0;
const int PWM_RESOLUTION = 8;  // 0~255 (8비트)

WiFiClient netClient;
PubSubClient mqttClient(netClient);

char deviceId[13];
char topicFanSetAll[32];
char topicFanSetId[32];
char topicFanState[32];
char topicStatus[32];

bool fanState = false;
int currentPwm = 0;

// 팬 속도 제어 함수 (PWM 0~255)
void setFanSpeed(int pwmValue) {
  pwmValue = constrain(pwmValue, 0, 255);
  currentPwm = pwmValue;
  fanState = (pwmValue > 0);

#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcWrite(FAN_PIN, pwmValue);
#else
  ledcWrite(PWM_CHANNEL, pwmValue);
#endif

  Serial.printf("[FAN CONTROL] State: %s | PWM: %d / 255\n", fanState ? "ON" : "OFF", currentPwm);

  // MQTT로 상태 전송
  if (mqttClient.connected()) {
    char stateBuf[16];
    snprintf(stateBuf, sizeof(stateBuf), "%d", currentPwm);
    mqttClient.publish(topicFanState, stateBuf, true);
  }
}

// MQTT 메시지 수신 콜백 함수 (Vercel 웹 앱 명령 처리)
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg = "";
  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }
  msg.trim();

  Serial.printf("[MQTT RECV] Topic: %s | Message: %s\n", topic, msg.c_str());

  // 팬 제어 토픽 수신 처리 (xiao/all/fan/set 또는 xiao/<deviceId>/fan/set)
  if (String(topic) == topicFanSetAll || String(topic) == topicFanSetId || String(topic).endsWith("/fan/set")) {
    String upperMsg = msg;
    upperMsg.toUpperCase();

    if (upperMsg == "OFF" || upperMsg == "0" || upperMsg == "FALSE") {
      setFanSpeed(0);
    } else if (upperMsg == "ON" || upperMsg == "TRUE") {
      setFanSpeed(255); // 기본 최대 속도
    } else {
      // 숫자 형태의 PWM 값 수신 (예: "255", "128", "190")
      int val = msg.toInt();
      setFanSpeed(val);
    }
  }
}

// MAC 주소 기반 고유 디바이스 ID 및 토픽 생성
void buildTopics() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  snprintf(deviceId, sizeof(deviceId), "%02x%02x%02x", mac[3], mac[4], mac[5]);
  
  snprintf(topicFanSetAll, sizeof(topicFanSetAll), "xiao/all/fan/set");
  snprintf(topicFanSetId, sizeof(topicFanSetId), "xiao/%s/fan/set", deviceId);
  snprintf(topicFanState, sizeof(topicFanState), "xiao/%s/fan/state", deviceId);
  snprintf(topicStatus, sizeof(topicStatus), "xiao/%s/status", deviceId);
}

void connectWiFi() {
  Serial.printf("Connecting to WiFi: %s ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[WiFi Connected]");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
}

void connectMqtt() {
  while (!mqttClient.connected()) {
    Serial.printf("Connecting to MQTT Broker (%s:%d)... ", MQTT_HOST, MQTT_PORT);
    String clientId = "ESP32-Fan-" + String(deviceId);

    if (mqttClient.connect(clientId.c_str(), NULL, NULL, topicStatus, 1, true, "offline")) {
      Serial.println("CONNECTED!");

      // 공통 및 디바이스 전용 토픽 구독
      mqttClient.subscribe(topicFanSetAll);
      mqttClient.subscribe(topicFanSetId);
      mqttClient.subscribe("xiao/+/fan/set");

      mqttClient.publish(topicStatus, "online", true);
      setFanSpeed(0); // 초기 상태 OFF
    } else {
      Serial.printf("FAILED (rc=%d), retrying in 3 seconds...\n", mqttClient.state());
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n==============================================");
  Serial.println(" Eco-Pet Care - ESP32 Fan Motor MQTT Control ");
  Serial.println("==============================================");

  // PWM 제어 핀 초기화
#if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
  ledcAttach(FAN_PIN, PWM_FREQ, PWM_RESOLUTION);
#else
  ledcSetup(PWM_CHANNEL, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(FAN_PIN, PWM_CHANNEL);
#endif

  connectWiFi();
  buildTopics();

  Serial.printf("Device ID: %s\n", deviceId);
  Serial.printf("Subscribed Fan Topic: %s\n", topicFanSetAll);

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  connectMqtt();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }
  if (!mqttClient.connected()) {
    connectMqtt();
  }
  mqttClient.loop();
}
