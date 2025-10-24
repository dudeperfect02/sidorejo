import { GoogleGenAI, Type, Modality } from "@google/genai";
import React from 'react';

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
    throw new Error("The API_KEY environment variable is not set.");
}
const ai = new GoogleGenAI({ apiKey: API_KEY });

const TARGET_CHAR_COUNT = 200000;
const NUM_CHUNKS = 20;
const CHARS_PER_CHUNK = TARGET_CHAR_COUNT / NUM_CHUNKS; // 10,000 characters

export interface StoryDetails {
    synopsis: string;
    hashtags: string[];
    tags: string[];
}

interface ProgressUpdate {
    percentage: number;
    chunk?: string;
    status: string;
    details?: StoryDetails;
}

// --- Audio Generation Helpers ---

function decodeBase64(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function splitText(text: string, maxLength: number): string[] {
    const sentences = text.match(/([^\.!\?]+[\.!\?]*)/g) || [];

    if (sentences.length === 0) {
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += maxLength) {
            chunks.push(text.substring(i, i + maxLength));
        }
        return chunks;
    }

    const chunks: string[] = [];
    let currentChunk = '';
    for (const sentence of sentences) {
        if ((currentChunk + sentence).length > maxLength && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = sentence;
        } else {
            currentChunk += sentence;
        }
    }
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }
    
    const finalChunks: string[] = [];
    chunks.forEach(chunk => {
        if(chunk.length > maxLength) {
            for (let i = 0; i < chunk.length; i += maxLength) {
                finalChunks.push(chunk.substring(i, i + maxLength));
            }
        } else {
            finalChunks.push(chunk);
        }
    });

    return finalChunks;
}

const TTS_CHUNK_LIMIT = 4500; // Safe character limit for each TTS API call

export const generateSpeech = async (text: string): Promise<string | null> => {
    if (!text.trim()) {
        console.warn("generateSpeech was called with empty text.");
        return null;
    }
    try {
        const textChunks = splitText(text, TTS_CHUNK_LIMIT);
        const audioDataChunks: Uint8Array[] = [];

        for (const chunk of textChunks) {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-preview-tts",
                contents: [{ parts: [{ text: chunk }] }],
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: 'Kore' },
                        },
                    },
                },
            });
            const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
            if (!base64Audio) {
                throw new Error(`No audio data received for a text chunk. The chunk may be too long or contain unsupported characters.`);
            }
            audioDataChunks.push(decodeBase64(base64Audio));
        }

        if (audioDataChunks.length === 0) {
            throw new Error("No audio data was generated for any text chunk.");
        }

        // Concatenate all Uint8Arrays into a single audio stream
        const totalLength = audioDataChunks.reduce((acc, arr) => acc + arr.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const arr of audioDataChunks) {
            combined.set(arr, offset);
            offset += arr.length;
        }

        return encodeBase64(combined);

    } catch (error) {
        console.error("Failed to generate speech:", error);
        return null;
    }
};

// --- Story Generation ---

const generateStoryDetails = async (fullStory: string): Promise<StoryDetails | null> => {
    try {
        const prompt = `Berdasarkan cerita berikut, tolong hasilkan sinopsis singkat, daftar tagar media sosial yang relevan, dan daftar kata kunci/tag untuk kategorisasi dalam Bahasa Indonesia.

Cerita:
---
${fullStory.slice(0, 150000)}
---

Tolong berikan output dalam format JSON.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        synopsis: { type: Type.STRING, description: "Ringkasan singkat dari cerita tersebut." },
                        hashtags: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: "Sebuah array tagar media sosial (contoh: #FiksiIlmiah)."
                        },
                        tags: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING },
                            description: "Sebuah array tag kata kunci (contoh: Cyberpunk)."
                        }
                    },
                    required: ["synopsis", "hashtags", "tags"]
                }
            }
        });
        
        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as StoryDetails;

    } catch (error) {
        console.error("Failed to generate story details:", error);
        return null;
    }
};

export const generateStory = async (
    initialPrompt: string,
    onProgress: (update: ProgressUpdate) => void,
    isCancelledRef: React.MutableRefObject<boolean>
): Promise<void> => {
    let fullStory = "";

    const systemInstruction = `You are a world-class novelist. Your task is to write a long, coherent, and engaging story based on a user's prompt. The story must be detailed, realistic, and avoid repetition. You will be writing the story in parts. I will provide you with the story written so far, and you must continue it seamlessly. IMPORTANT: Begin your response directly with the story text. Do not add any introductory phrases, conversational filler, or greetings like 'Tentu,', 'Here is the next part,', or similar preamble. Go straight to the point and continue the narrative.`;

    for (let i = 0; i < NUM_CHUNKS; i++) {
        if (isCancelledRef.current) {
            onProgress({
                percentage: (i / NUM_CHUNKS) * 100,
                status: "Generation stopped by user."
            });
            break; // Exit the loop
        }

        let currentPrompt = "";
        if (i === 0) {
            currentPrompt = `Here is the story idea: "${initialPrompt}". Begin writing the first part of the story. Write approximately ${CHARS_PER_CHUNK} characters. Do not write the whole story, just the beginning.`;
        } else {
            const contextStory = fullStory.slice(-50000); // Use last 50k chars for context
            currentPrompt = `Here is the original story idea: "${initialPrompt}".
Here is the story so far:
---
${contextStory}
---
Please continue the story from where it left off. Introduce new plot points, deepen character development, and maintain a realistic and engaging narrative. Do not repeat previous events or descriptions. Write the next part of the story, approximately ${CHARS_PER_CHUNK} characters long. Do not summarize or end the story. Just write the next part.`;
        }
        
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-pro',
                contents: currentPrompt,
                config: {
                    systemInstruction: systemInstruction,
                    temperature: 0.85,
                    topP: 0.95,
                    topK: 40,
                }
            });
            
            // Strictly enforce the character limit per chunk
            const newChunk = response.text.slice(0, CHARS_PER_CHUNK);

            if (newChunk) {
               fullStory += newChunk;
               const percentage = ((i + 1) / NUM_CHUNKS) * 100;
               const status = `Weaving part ${i + 2} of ${NUM_CHUNKS}...`;
               onProgress({ percentage, chunk: newChunk, status });
            }

        } catch (error) {
            console.error("Error generating story chunk:", error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            onProgress({
                percentage: (i / NUM_CHUNKS) * 100,
                status: `Error: ${errorMessage}. Please check your API key and network connection.`
            });
            return;
        }
    }

    if (fullStory.trim().length > 0 && !isCancelledRef.current) {
        onProgress({
            percentage: 100,
            status: "Generating story details..."
        });

        const details = await generateStoryDetails(fullStory);

        onProgress({
           percentage: 100,
           status: "Story generation complete!",
           details: details ?? undefined,
       });
    }
};