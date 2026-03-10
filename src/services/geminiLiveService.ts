import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "../constants";

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private session: any = null;
  private onMessageCallback: (message: LiveServerMessage) => void;

  constructor(onMessage: (message: LiveServerMessage) => void) {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    this.onMessageCallback = onMessage;
  }

  async connect(language: string) {
    this.session = await this.ai.live.connect({
      model: "gemini-2.5-flash-native-audio-preview-09-2025",
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
        },
        systemInstruction: SYSTEM_INSTRUCTION + `\n\nCurrently assisting in: ${language}`,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onopen: () => console.log("Live connection opened"),
        onmessage: (message: LiveServerMessage) => this.onMessageCallback(message),
        onclose: () => console.log("Live connection closed"),
        onerror: (error) => console.error("Live connection error:", error),
      },
    });
    return this.session;
  }

  async sendAudio(base64Data: string) {
    if (this.session) {
      await this.session.sendRealtimeInput({
        media: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
      });
    }
  }

  async sendMessage(text: string) {
    if (this.session) {
      await this.session.send({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete: true
        }
      });
    }
  }

  disconnect() {
    if (this.session) {
      this.session.close();
      this.session = null;
    }
  }
}
