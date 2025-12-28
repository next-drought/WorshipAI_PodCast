
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { VoiceStyle, AnalysisResult } from "../types";
import { decode, encode, addWavHeader } from "../utils/audioUtils";

const API_KEY = process.env.API_KEY || "";

function splitTranscript(text: string, maxChars: number = 3000): string[] {
  const chunks: string[] = [];
  let currentText = text.trim();

  while (currentText.length > 0) {
    if (currentText.length <= maxChars) {
      chunks.push(currentText);
      break;
    }

    let splitIndex = currentText.lastIndexOf('.', maxChars);
    if (splitIndex === -1) splitIndex = currentText.lastIndexOf('?', maxChars);
    if (splitIndex === -1) splitIndex = currentText.lastIndexOf('!', maxChars);
    if (splitIndex === -1) splitIndex = currentText.lastIndexOf('\n', maxChars);
    if (splitIndex === -1) splitIndex = currentText.lastIndexOf(' ', maxChars);
    
    if (splitIndex === -1 || splitIndex < maxChars * 0.4) {
      splitIndex = maxChars;
    } else {
      splitIndex += 1;
    }

    chunks.push(currentText.substring(0, splitIndex).trim());
    currentText = currentText.substring(splitIndex).trim();
  }

  return chunks;
}

export async function transcribeAudio(base64Audio: string, mimeType: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Audio
            }
          },
          {
            text: "Please transcribe this audio exactly as spoken. Output only the transcript text."
          }
        ]
      }
    ]
  });
  return response.text || "";
}

export async function analyzeVoiceSample(base64Audio: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: 'audio/wav',
              data: base64Audio
            }
          },
          {
            text: `Analyze the tone, pitch, and energy of the speaker in this audio. 
            Describe the vocal profile in one concise sentence.`
          }
        ]
      }
    ]
  });

  return response.text || "Vocal profile analyzed.";
}

export async function extractEnglishFromBilingual(text: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `The following text is bilingual. Extract and consolidate ONLY the English sections into a clean monologue transcript. Maintain the original message. Transcript: \n\n ${text}`,
    config: {
      systemInstruction: "You are a professional script editor. Extract only the English text, ensuring it forms a cohesive monologue. No headers, no metadata, just the speech."
    }
  });
  return response.text.trim();
}

export async function generatePodcastAudio(
  transcript: string, 
  voice: VoiceStyle,
  onProgress?: (percent: number) => void,
  voiceSample?: { data: string, mimeType: string } | null
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const chunks = splitTranscript(transcript);
  const rawPcmChunks: Uint8Array[] = [];

  // If a voice sample is provided, we use the native audio model for guidance
  const modelName = voiceSample ? 'gemini-2.5-flash-native-audio-preview-09-2025' : 'gemini-2.5-flash-preview-tts';

  for (let i = 0; i < chunks.length; i++) {
    try {
      const chunk = chunks[i];
      
      const contents = voiceSample ? {
        parts: [
          { inlineData: { mimeType: voiceSample.mimeType, data: voiceSample.data } },
          { text: `Read the following text. Imitate the voice identity, tone, and pacing of the attached audio reference exactly: ${chunk}` }
        ]
      } : [{ parts: [{ text: chunk }] }];

      const response = await ai.models.generateContent({
        model: modelName,
        contents: contents as any,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      });

      const base64Chunk = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
      if (base64Chunk) {
        rawPcmChunks.push(decode(base64Chunk));
      }

      if (onProgress) {
        onProgress(Math.round(((i + 1) / chunks.length) * 100));
      }
    } catch (err) {
      console.error("Chunk processing failed:", err);
      throw err;
    }
  }

  if (rawPcmChunks.length === 0) throw new Error("Audio generation resulted in empty output.");

  const totalLength = rawPcmChunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const combinedPcm = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of rawPcmChunks) {
    combinedPcm.set(chunk, offset);
    offset += chunk.length;
  }

  const wavData = addWavHeader(combinedPcm, 24000);
  return encode(wavData);
}
