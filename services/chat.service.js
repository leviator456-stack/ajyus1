import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { getPlan } from "../config/plans.js";

const FALLBACK_MODEL = "gemini-3.1-flash-lite";
const REQUEST_TIMEOUT_MS = 6000;

const SYSTEM_INSTRUCTION = `
You are AJYUS, a helpful AI assistant.
Answer clearly, accurately, and professionally.
Always identify yourself as AJYUS.
Do not mention or reveal the