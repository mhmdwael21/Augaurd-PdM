/*
========================================
HX710B Triple Pressure System
ESP32
After Pump / After Filter / Tank
WiFi + FastAPI Sender
========================================
*/

#include <WiFi.h>
#include <HTTPClient.h>

// ===============================
// WiFi
// ===============================

// const char* ssid = "Mohamedd";
// const char* password = "HzN#0100400";
// const char* serverUrl = "http://192.168.1.106:8000/pressure";

const char* ssid = "Elhefnawy_office";
const char* password = "Elhefnawy#55667788#";
const char* serverUrl = "http://192.168.1.113:8000/hardware/ingest";

// Static device key — must match HARDWARE_API_KEY in the backend .env
const char* deviceKey = "auguard-esp32-dev-key";


// ===============================
// HX710B Pins
// ===============================

#define HX_SCK 32

#define AP_DOUT 33
#define AF_DOUT 25
#define TK_DOUT 26

// ===============================
// Calibration
// ===============================

float AP_OFFSET = -2003000; // not bad, but can be adjusted slightly
float AF_OFFSET = -60000;   // bad, try -2003000
float TK_OFFSET = -610000;  // work approximately

float SCALE = 0.00005;

// ===============================
// Smoothing
// ===============================

float alphaAP = 0.88;
float alphaAF = 0.80;
float alphaTK = 0.82;

// ===============================
// Smoothed values
// ===============================

float ap_f = 0;
float af_f = 0;
float tk_f = 0;

// ===============================
// READ HX710B
// ===============================

long readHX710B(int doutPin)
{
  long count = 0;

  pinMode(doutPin, INPUT);
  pinMode(HX_SCK, OUTPUT);

  while (digitalRead(doutPin) == HIGH);

  for (int i = 0; i < 24; i++)
  {
    digitalWrite(HX_SCK, HIGH);

    count = count << 1;

    digitalWrite(HX_SCK, LOW);

    if (digitalRead(doutPin))
      count++;
  }

  digitalWrite(HX_SCK, HIGH);
  digitalWrite(HX_SCK, LOW);

  if (count & 0x800000)
    count |= 0xFF000000;

  return count;
}

// ===============================
// RAW -> kPa
// ===============================

float toKpa(long raw, float offset)
{
  float p = (raw - offset) * SCALE;

  if (p < 0)
    p = 0;

  if (p > 40)
    p = 40;

  return p;
}

// ===============================
// Connect WiFi
// ===============================

void connectWiFi()
{
  Serial.println();
  Serial.print("Connecting to WiFi");

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi Connected");
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
}

// ===============================
// Setup
// ===============================

void setup()
{
  Serial.begin(115200);

  pinMode(HX_SCK, OUTPUT);

  connectWiFi();

  Serial.println("================================");
  Serial.println("PRESSURE SYSTEM STARTED");
  Serial.println("================================");
}

// ===============================
// Loop
// ===============================

void loop()
{
  long rawAP = readHX710B(AP_DOUT);
  long rawAF = readHX710B(AF_DOUT);
  long rawTK = readHX710B(TK_DOUT);

  // ===============================
  // Print RAW Values
  // ===============================

  Serial.println("---------- RAW VALUES ----------");

  Serial.print("RAW AP : ");
  Serial.println(rawAP);

  Serial.print("RAW AF : ");
  Serial.println(rawAF);

  Serial.print("RAW TK : ");
  Serial.println(rawTK);

  Serial.println("--------------------------------");

  float ap = toKpa(rawAP, AP_OFFSET);
  float af = toKpa(rawAF, AF_OFFSET);
  float tk = toKpa(rawTK, TK_OFFSET);

  // Exponential smoothing

  ap_f = (alphaAP * ap_f) + ((1.0 - alphaAP) * ap);
  af_f = (alphaAF * af_f) + ((1.0 - alphaAF) * af);
  tk_f = (alphaTK * tk_f) + ((1.0 - alphaTK) * tk);

  int AP_out = round(ap_f);
  int AF_out = round(af_f);
  int TK_out = round(tk_f);

  Serial.println("================================");

  Serial.print("After Pump   : ");
  Serial.print(AP_out);
  Serial.println(" kPa");

  Serial.print("After Filter : ");
  Serial.print(AF_out);
  Serial.println(" kPa");

  Serial.print("Tank         : ");
  Serial.print(TK_out);
  Serial.println(" kPa");

  Serial.println("================================");

  // ===============================
  // Send to FastAPI
  // ===============================

  if (WiFi.status() != WL_CONNECTED)
  {
    Serial.println("WiFi Lost - Reconnecting...");
    WiFi.disconnect();
    connectWiFi();
  }

  if (WiFi.status() == WL_CONNECTED)
  {
    HTTPClient http;

    http.begin(serverUrl);

    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Key", deviceKey);

    String json =
      "{\"after_pump\":" + String(AP_out) +
      ",\"after_filter\":" + String(AF_out) +
      ",\"tank\":" + String(TK_out) +
      ",\"raw_ap\":" + String(rawAP) +
      ",\"raw_af\":" + String(rawAF) +
      ",\"raw_tk\":" + String(rawTK) +
      "}";

    int responseCode = http.POST(json);

    Serial.print("HTTP Response Code: ");
    Serial.println(responseCode);

    if (responseCode > 0)
    {
      String response = http.getString();

      Serial.print("Server Response: ");
      Serial.println(response);
    }

    http.end();
  }

  delay(1000);
}