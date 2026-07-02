import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "./resumeContext.js";

const PORT = process.env.PORT || 3001;

if (!process.env.OPENAI_API_KEY) {
  console.warn("[warn] OPENAI_API_KEY is not set. Put it in backend/.env — see backend/.env.example.");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
const allowedOrigins = [
  process.env.FRONTEND_ORIGIN,
  "http://localhost:5173",
].filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    },
  })
);
app.use(express.json());

app.post("/api/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing 'message' string in request body." });
    }

    const priorTurns = Array.isArray(history) ? history.slice(-10) : [];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...priorTurns.map((turn) => ({
          role: turn.role === "user" ? "user" : "assistant",
          content: turn.content,
        })),
        { role: "user", content: message },
      ],
      temperature: 0.6,
      max_tokens: 300,
    });

    const reply = completion.choices[0]?.message?.content?.trim() || "";
    res.json({ reply });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Failed to get a response from the AI assistant." });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
