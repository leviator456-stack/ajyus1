import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { getPlan } from "../config/plans.js";

export async function generateChatReply(message, planName = "free") {
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("Message likhna zaroori hai.");
  }

  if (!env.geminiApiKey) {
    throw new Error("Gemini API key set nahi hai.");
  }

  const selectedPlan = getPlan(planName);

  const ai = new GoogleGenAI({
    apiKey: env.geminiApiKey
  });

  const interaction = await ai.interactions.create({
    model: selectedPlan.model,
    input: message.trim(),
    system_instruction:
      "You are AJYUS, a helpful AI assistant. Answer clearly and professionally."
  });

  const reply = interaction.output_text?.trim();

  if (!reply) {
    throw new Error("Gemini se response nahi mila.");
  }

  return reply;
}