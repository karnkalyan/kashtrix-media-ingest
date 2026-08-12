
import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.warn("API_KEY not found in environment variables. AI features will be disabled.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY! });

export const explainCommand = async (command: string): Promise<string> => {
  if (!API_KEY) {
    return "AI service is not available. Please configure your API_KEY.";
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Explain this FFMPEG command to a beginner. Break down each flag and parameter, and explain its purpose in a simple, clear, and concise way. Use markdown for formatting, like using backticks for flags. Command: \n\n\`${command}\``,
      config: {
        systemInstruction: "You are an expert FFMPEG assistant that explains complex commands in a simple and easy-to-understand manner for beginners.",
        temperature: 0.5,
      }
    });
    return response.text;
  } catch (error) {
    console.error("Error explaining command with Gemini:", error);
    return "Sorry, I couldn't get an explanation from the AI service at this time.";
  }
};
