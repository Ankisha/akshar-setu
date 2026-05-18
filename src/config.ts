import { Platform } from "react-native";

/**
 * STT server URL.
 *
 * When running the Gemma server on your Mac (`python server/main.py`),
 * set this to your Mac's LAN IP. Find it with:
 *   ipconfig getifaddr en0
 *
 * Android emulator can use 10.0.2.2 to reach the host machine.
 * iOS simulator can use localhost/127.0.0.1.
 * Physical devices need the real LAN IP.
 */

const MAC_LAN_IP = "10.60.104.21"; // ← CHANGE THIS to your Mac's IP

const getBaseUrl = (): string => {
  if (Platform.OS === "web") {
    return ""; // same origin in production; relative paths
  }
  if (Platform.OS === "android") {
    return `http://10.0.2.2:8642`;
  }
  // iOS simulator or physical device
  return `http://${MAC_LAN_IP}:8642`;
};

export const STT_SERVER_URL = `${getBaseUrl()}/transcribe`;
export const STT_HEALTH_URL = `${getBaseUrl()}/health`;
export const TTS_SYNTHESIZE_URL = `${getBaseUrl()}/synthesize`;
export const DETERMINE_LEVEL_URL = `${getBaseUrl()}/determine-level`;
export const GENERATE_SESSION_URL = `${getBaseUrl()}/generate-session`;
