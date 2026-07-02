import { useState, useEffect, useRef, KeyboardEvent } from "react";

type LineType = "command" | "output" | "error" | "welcome" | "ai-output" | "ai-command" | "about";

interface HistoryLine {
  id: number;
  type: LineType;
  content: string;
}

type Mode = "terminal" | "ai";

type ChatRole = "user" | "assistant" | "system" | "error";

interface ChatTurn {
  id: number;
  role: ChatRole;
  content: string;
  time: string;
}

const CHAT_API_URL =
  import.meta.env.VITE_API_URL?.trim() || "http://localhost:3001/api/chat";

const SUGGESTION_CHIPS = [
  "Tell me about his experience",
  "What are his technical skills?",
  "Walk me through his projects",
  "What's he studying?",
];

const WELCOME_LINES: HistoryLine[] = [
  { id: 0, type: "welcome", content: "╔══════════════════════════════════════════════════╗" },
  { id: 1, type: "welcome", content: "║        Welcome to Quan Do's terminal portfolio!  ║" },
  { id: 2, type: "welcome", content: "╚══════════════════════════════════════════════════╝" },
  { id: 3, type: "output", content: "" },
  { id: 4, type: "output", content: "Type \x1b[36mhelp\x1b[0m to see available commands." },
  { id: 5, type: "output", content: "Type \x1b[36mQuan\x1b[0m to chat with my AI profile assistant." },
  { id: 6, type: "output", content: "" },
];

type DirectoryState = "home" | "projects" | "experience" | "education";

const DIR_PROMPTS: Record<DirectoryState, string> = {
  home: "quan@portfolio:~$",
  projects: "quan@portfolio:~/projects$",
  experience: "quan@portfolio:~/experience$",
  education: "quan@portfolio:~/education$",
};

const COMMANDS = ["help", "ls", "cat", "cd", "clear", "Quan"];
const HOME_FILES = ["about.txt", "resume.txt", "skills.txt", "contact.txt"];
const CD_TARGETS = ["projects", "experience", "education", "~"];

const PROJECT_DETAILS: Record<string, { title: string; stack: string; bullets: string[] }> = {
  Gastric_Cancer_Histopathology_Classification: {
    title: "Gastric Cancer Histopathology Classification",
    stack: "Hybrid CNN-ML Pipeline — ResNet50, SVM, XGBoost",
    bullets: [
      "Built a hybrid CNN-ML pipeline for gastric cancer histopathology, achieving",
      "79.24% multi-class and 95% binary classification accuracy.",
      "Reduced preprocessing time by 30% through optimized patch extraction and",
      "normalization.",
      "Visualized tumor microenvironments using heatmaps to reveal compositional",
      "differences between normal and cancerous tissues.",
    ],
  },
  DataAlchemy: {
    title: "DataAlchemy",
    stack: "Multi-Agent AI/ML Orchestration Platform",
    bullets: [
      "Built a config-driven multi-agent AI/ML platform to automate data analysis,",
      "preprocessing, model training, evaluation, and reporting across end-to-end",
      "machine learning workflows.",
      "Designed a YAML-based agent configuration system enabling dynamic task",
      "delegation, modular tool integration, and flexible orchestration without",
      "hardcoded pipelines.",
      "Integrated modular tooling and optional Docker runtime support to improve",
      "extensibility, isolation, and deployment readiness.",
    ],
  },
};

const PROJECT_FILES = Object.keys(PROJECT_DETAILS);

function makeBox(title: string, lines: string[], contentWidth = 76): string[] {
  const top = `┌─ ${title} ${"─".repeat(Math.max(contentWidth + 1 - title.length, 1))}┐`;
  const bottom = `└${"─".repeat(contentWidth + 4)}┘`;
  const body = lines.map((l) => `│  ${l.padEnd(contentWidth)}  │`);
  return [top, ...body, bottom];
}

function splitCompletionInput(raw: string): { priorTokens: string[]; currentToken: string; tokenIndex: number } {
  const hasTrailingSpace = /\s$/.test(raw);
  const tokens = raw.split(/\s+/).filter(Boolean);
  const priorTokens = hasTrailingSpace ? tokens : tokens.slice(0, -1);
  const currentToken = hasTrailingSpace ? "" : tokens[tokens.length - 1] ?? "";
  const tokenIndex = priorTokens.length;
  return { priorTokens, currentToken, tokenIndex };
}

function getCompletions(raw: string, dir: DirectoryState): string[] {
  const { priorTokens, currentToken, tokenIndex } = splitCompletionInput(raw);

  if (tokenIndex === 0) {
    return COMMANDS.filter((c) => c.toLowerCase().startsWith(currentToken.toLowerCase()));
  }

  const command = priorTokens[0]?.toLowerCase();

  if (command === "cat" && tokenIndex === 1 && dir === "home") {
    return HOME_FILES.filter((f) => f.startsWith(currentToken));
  }

  if (command === "cat" && tokenIndex === 1 && dir === "projects") {
    return PROJECT_FILES.filter((f) => f.startsWith(currentToken));
  }

  if (command === "cd" && tokenIndex === 1) {
    return CD_TARGETS.filter((t) => t.startsWith(currentToken));
  }

  return [];
}

function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  return strings.reduce((acc, cur) => {
    let i = 0;
    while (i < acc.length && i < cur.length && acc[i] === cur[i]) i++;
    return acc.slice(0, i);
  });
}

function applyCompletion(raw: string, candidates: string[]): string {
  if (candidates.length === 0) return raw;

  const { priorTokens, currentToken } = splitCompletionInput(raw);

  if (candidates.length === 1) {
    return [...priorTokens, candidates[0]].join(" ") + " ";
  }

  const commonPrefix = longestCommonPrefix(candidates);
  if (commonPrefix.length > currentToken.length) {
    return [...priorTokens, commonPrefix].join(" ");
  }

  return raw;
}

function processCommand(
  raw: string,
  dir: DirectoryState,
  setDir: (d: DirectoryState) => void
): { lines: HistoryLine[]; nextId: number; clearAll?: boolean } {
  const cmd = raw.trim();
  let id = Date.now();

  const out = (content: string, type: LineType = "output"): HistoryLine => ({
    id: id++,
    type,
    content,
  });

  if (cmd === "clear") {
    return { lines: [], nextId: id, clearAll: true };
  }

  if (cmd === "help") {
    return {
      lines: [
        out(""),
        out("Available commands:", "output"),
        out(""),
        out("  \x1b[36mhelp\x1b[0m              — show this help message"),
        out("  \x1b[36mls\x1b[0m                — list files and directories"),
        out("  \x1b[36mcat about.txt\x1b[0m     — display bio and photo"),
        out("  \x1b[36mcat resume.txt\x1b[0m    — display resume summary"),
        out("  \x1b[36mcat skills.txt\x1b[0m    — display skills"),
        out("  \x1b[36mcat contact.txt\x1b[0m   — display contact info"),
        out("  \x1b[36mcd projects\x1b[0m       — navigate to projects directory"),
        out("  \x1b[36mcat <project>\x1b[0m     — view a project's details (inside ~/projects)"),
        out("  \x1b[36mcd experience\x1b[0m     — navigate to experience directory"),
        out("  \x1b[36mcd education\x1b[0m      — navigate to education directory"),
        out("  \x1b[36mcd ~\x1b[0m              — return to home directory"),
        out("  \x1b[36mclear\x1b[0m             — clear the terminal"),
        out("  \x1b[36mQuan\x1b[0m              — launch AI portfolio assistant"),
        out(""),
      ],
      nextId: id,
    };
  }

  if (cmd === "ls") {
    if (dir === "home") {
      return {
        lines: [
          out(""),
          out("\x1b[33mabout.txt\x1b[0m    \x1b[33mresume.txt\x1b[0m   \x1b[33mskills.txt\x1b[0m   \x1b[33mcontact.txt\x1b[0m"),
          out("\x1b[32mprojects/\x1b[0m    \x1b[32mexperience/\x1b[0m  \x1b[32meducation/\x1b[0m"),
          out(""),
        ],
        nextId: id,
      };
    }
    if (dir === "projects") {
      return {
        lines: [
          out(""),
          out("\x1b[33mGastric_Cancer_Histopathology_Classification\x1b[0m"),
          out("\x1b[33mDataAlchemy\x1b[0m"),
          out(""),
        ],
        nextId: id,
      };
    }
    if (dir === "experience") {
      return {
        lines: [
          out(""),
          out("\x1b[33mLife_in_AI_Center.txt\x1b[0m"),
          out("\x1b[33mSCU_AI_Research.txt\x1b[0m"),
          out("\x1b[33mARDC.txt\x1b[0m"),
          out(""),
        ],
        nextId: id,
      };
    }
    if (dir === "education") {
      return {
        lines: [
          out(""),
          out("\x1b[33mSanta_Clara_University.txt\x1b[0m"),
          out(""),
        ],
        nextId: id,
      };
    }
  }

  if (cmd === "cat about.txt") {
    return {
      lines: [
        out(""),
        out("about.txt", "about"),
        out(""),
      ],
      nextId: id,
    };
  }

  if (cmd === "cat resume.txt") {
    return {
      lines: [
        out(""),
        out("┌─ resume.txt ──────────────────────────────────────────────┐"),
        out("│                                                              │"),
        out("│  EDUCATION                                                  │"),
        out("│  ──────────────────────────────────────────────────────    │"),
        out("│  Santa Clara University                                     │"),
        out("│  B.S. Computer Science and Engineering (Honors), Tau Beta Pi │"),
        out("│  Sept 2023 – June 2027  |  GPA: 3.89 / 4.0                  │"),
        out("│                                                              │"),
        out("│  EXPERIENCE                                                 │"),
        out("│  ──────────────────────────────────────────────────────    │"),
        out("│  Life in AI Center   AI System & Prototyping Intern         │"),
        out("│  SCU                 AI Research Intern                     │"),
        out("│  ARDC                Data Research Intern                   │"),
        out("│                                                              │"),
        out("│  PROJECTS                                                   │"),
        out("│  ──────────────────────────────────────────────────────    │"),
        out("│  Gastric Cancer Histopathology Classification (CNN-ML)      │"),
        out("│  DataAlchemy (Multi-Agent AI/ML Orchestration Platform)      │"),
        out("│                                                              │"),
        out("└──────────────────────────────────────────────────────────────┘"),
        out(""),
      ],
      nextId: id,
    };
  }

  if (cmd === "cat skills.txt") {
    return {
      lines: [
        out(""),
        out("┌─ skills.txt ──────────────────────────────────────────────┐"),
        out("│                                                             │"),
        out("│  LANGUAGES                                                 │"),
        out("│    C++  C  Python  JavaScript  TypeScript                  │"),
        out("│                                                             │"),
        out("│  FRAMEWORKS & LIBRARIES                                    │"),
        out("│    FastAPI  React  Next.js  TensorFlow  Keras  Flask       │"),
        out("│    Django  Node.js                                         │"),
        out("│                                                             │"),
        out("│  TOOLS & PLATFORMS                                         │"),
        out("│    Docker  AWS  PostgreSQL  GitHub Actions  Git            │"),
        out("│                                                             │"),
        out("└─────────────────────────────────────────────────────────────┘"),
        out(""),
      ],
      nextId: id,
    };
  }

  if (cmd === "cat contact.txt") {
    return {
      lines: [
        out(""),
        out("┌─ contact.txt ─────────────────────────────────────────────┐"),
        out("│                                                             │"),
        out("│  Email:    qldo@scu.edu                                    │"),
        out("│  Phone:    669 203 7717                                    │"),
        out("│  GitHub:   github.com/dolamquan                            │"),
        out("│  LinkedIn: linkedin.com/in/QuanDo                          │"),
        out("│  Location: Santa Clara, CA                                 │"),
        out("│                                                             │"),
        out("└─────────────────────────────────────────────────────────────┘"),
        out(""),
      ],
      nextId: id,
    };
  }

  if (cmd === "cd projects") {
    setDir("projects");
    return {
      lines: [
        out(""),
        out("\x1b[32mEntered ~/projects\x1b[0m — 2 projects found."),
        out(""),
        out("  \x1b[33mGastric_Cancer_Histopathology_Classification\x1b[0m"),
        out("  \x1b[33mDataAlchemy\x1b[0m"),
        out(""),
        out("Type \x1b[36mls\x1b[0m to list, or \x1b[36mcat <name>\x1b[0m to view a project's details."),
        out(""),
      ],
      nextId: id,
    };
  }

  if (dir === "projects" && cmd.startsWith("cat ")) {
    const target = cmd.slice(4).trim();
    const project = PROJECT_DETAILS[target];

    if (project) {
      const boxLines = makeBox(project.title, [project.stack, "", ...project.bullets]);
      return {
        lines: [out(""), ...boxLines.map((l) => out(l)), out("")],
        nextId: id,
      };
    }

    return {
      lines: [
        out(""),
        out(`\x1b[31mcat: ${target}: no such project\x1b[0m — try \x1b[36mls\x1b[0m to see available projects`, "error"),
        out(""),
      ],
      nextId: id,
    };
  }

  if (cmd === "cd experience") {
    setDir("experience");
    return {
      lines: [
        out(""),
        out("\x1b[32mEntered ~/experience\x1b[0m — 3 roles found. Type \x1b[36mls\x1b[0m to list."),
        out(""),
        out("  \x1b[33mLife in AI Center\x1b[0m  — AI System and Prototyping Intern (May 2026 – Present)"),
        out("  \x1b[33mSCU AI Research\x1b[0m    — AI Research Intern (March 2026 – Present)"),
        out("  \x1b[33mARDC\x1b[0m               — Data Research Intern (June 2025 – Sept 2025)"),
        out(""),
      ],
      nextId: id,
    };
  }

  if (cmd === "cd education") {
    setDir("education");
    return {
      lines: [
        out(""),
        out("\x1b[32mEntered ~/education\x1b[0m — 1 institution found."),
        out(""),
        out("  \x1b[33mSanta Clara University\x1b[0m — B.S. CS&E (Honors), Tau Beta Pi, GPA 3.89/4.0"),
        out(""),
      ],
      nextId: id,
    };
  }

  if (cmd === "cd ~" || cmd === "cd" || cmd === "cd ..") {
    setDir("home");
    return {
      lines: [out(""), out("\x1b[32mReturned to ~\x1b[0m"), out("")],
      nextId: id,
    };
  }

  if (cmd.toLowerCase() === "quan") {
    return { lines: [], nextId: id };
  }

  if (cmd === "") {
    return { lines: [], nextId: id };
  }

  return {
    lines: [
      out(""),
      out(`\x1b[31mbash: command not found: ${cmd}\x1b[0m — try \x1b[36mhelp\x1b[0m`, "error"),
      out(""),
    ],
    nextId: id,
  };
}

function renderANSI(text: string): React.ReactNode {
  const parts = text.split(/(\x1b\[\d+m)/g);
  let color = "";
  const nodes: React.ReactNode[] = [];

  const colorMap: Record<string, string> = {
    "\x1b[36m": "text-cyan-400",
    "\x1b[33m": "text-yellow-400",
    "\x1b[32m": "text-green-400",
    "\x1b[31m": "text-red-400",
    "\x1b[0m": "",
  };

  parts.forEach((part, i) => {
    if (colorMap[part] !== undefined) {
      color = colorMap[part];
    } else if (part) {
      nodes.push(
        <span key={i} className={color || undefined}>
          {part}
        </span>
      );
    }
  });

  return nodes;
}

function AboutBlock() {
  return (
    <div className="flex flex-col sm:flex-row gap-4 items-start border border-white/10 rounded-lg p-4 my-1 bg-white/[0.02]">
      <img
        src={`${import.meta.env.BASE_URL}headshot.jpg`}
        alt="Quan Do headshot"
        className="w-24 h-24 sm:w-28 sm:h-28 rounded-md object-cover border border-white/10 flex-shrink-0"
      />
      <div className="font-mono text-sm leading-relaxed text-gray-300 space-y-1">
        <div className="text-cyan-400">Quan Do</div>
        <div>Santa Clara University — B.S. Computer Science and Engineering (Honors), Tau Beta Pi</div>
        <div className="text-gray-400">
          CS&amp;E student interested in AI systems, machine learning, RAG pipelines, AI tutors, and
          multi-agent platforms. Currently an AI System and Prototyping Intern at the Life in AI Center
          and an AI Research Intern at SCU, working on LLM-powered tutoring tools and model evaluation.
        </div>
        <div className="text-gray-500 flex flex-wrap gap-x-2">
          <span>Santa Clara, CA · qldo@scu.edu ·</span>
          <a
            href="https://github.com/dolamquan"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
          >
            github.com/dolamquan
          </a>
          <span>·</span>
          <a
            href="https://linkedin.com/in/QuanDo"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
          >
            linkedin.com/in/QuanDo
          </a>
        </div>
      </div>
    </div>
  );
}

function TerminalLine({ line }: { line: HistoryLine }) {
  const baseClass = "font-mono text-sm leading-relaxed whitespace-pre-wrap break-all";

  if (line.type === "welcome") {
    return <div className={`${baseClass} text-cyan-400`}>{line.content}</div>;
  }
  if (line.type === "command") {
    return (
      <div className={`${baseClass} text-gray-200`}>
        <span className="text-cyan-400">{line.content.split(" ").slice(0, 1)[0]} </span>
        {line.content.slice(line.content.indexOf(" ") + 1)}
      </div>
    );
  }
  if (line.type === "error") {
    return <div className={`${baseClass} text-red-400`}>{renderANSI(line.content)}</div>;
  }
  if (line.type === "ai-command") {
    return (
      <div className={`${baseClass}`}>
        <span className="text-purple-400">quan-ai&gt; </span>
        <span className="text-gray-200">{line.content}</span>
      </div>
    );
  }
  if (line.type === "ai-output") {
    return <div className={`${baseClass} text-purple-300`}>{line.content}</div>;
  }
  if (line.type === "about") {
    return <AboutBlock />;
  }
  return <div className={`${baseClass} text-gray-400`}>{renderANSI(line.content)}</div>;
}

/* ---------------------------------------------------------------------- */
/* Quan AI chat mode — a quiet, minimal surface, deliberately unlike the    */
/* terminal and deliberately unlike any typical chat-product theme.        */
/* ---------------------------------------------------------------------- */

const CHAT_BG = "#0a0a0b";
const CHAT_SURFACE = "#111113";
const CHAT_TEXT = "#e7e7e9";
const CHAT_MUTED = "#6d6d74";
const CHAT_LINE = "rgba(255,255,255,0.09)";
const CHAT_ERROR = "#c98080";

function ChatBubble({ turn, index }: { turn: ChatTurn; index: number }) {
  const delay = `${Math.min(index, 6) * 40}ms`;

  if (turn.role === "system") {
    return (
      <div className="chat-turn-enter flex items-center gap-3 my-5" style={{ animationDelay: delay }}>
        <div className="flex-1 h-px" style={{ background: CHAT_LINE }} />
        <span
          className="text-[10px] uppercase tracking-[0.2em]"
          style={{ color: CHAT_MUTED, fontFamily: "'JetBrains Mono', monospace" }}
        >
          {turn.content}
        </span>
        <div className="flex-1 h-px" style={{ background: CHAT_LINE }} />
      </div>
    );
  }

  if (turn.role === "user") {
    return (
      <div className="chat-turn-enter flex flex-col items-end my-5" style={{ animationDelay: delay }}>
        <span
          className="text-[10px] uppercase tracking-[0.2em] mb-1.5"
          style={{ color: CHAT_MUTED, fontFamily: "'JetBrains Mono', monospace" }}
        >
          you
        </span>
        <div
          className="text-[13px] leading-relaxed whitespace-pre-wrap break-word text-right max-w-[85%]"
          style={{ color: CHAT_TEXT, fontFamily: "'JetBrains Mono', monospace" }}
        >
          {turn.content}
        </div>
      </div>
    );
  }

  const isError = turn.role === "error";

  return (
    <div
      className="chat-turn-enter flex flex-col my-5 pl-3"
      style={{ animationDelay: delay, borderLeft: `1px solid ${isError ? "rgba(201,128,128,0.3)" : CHAT_LINE}` }}
    >
      <span
        className="text-[10px] uppercase tracking-[0.2em] mb-1.5"
        style={{ color: isError ? CHAT_ERROR : CHAT_MUTED, fontFamily: "'JetBrains Mono', monospace" }}
      >
        quan
      </span>
      <div
        className="text-[13px] leading-relaxed whitespace-pre-wrap break-word"
        style={{ color: isError ? CHAT_ERROR : CHAT_TEXT, fontFamily: "'JetBrains Mono', monospace" }}
      >
        {turn.content}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="chat-turn-enter flex flex-col my-5 pl-3" style={{ borderLeft: `1px solid ${CHAT_LINE}` }}>
      <span
        className="text-[10px] uppercase tracking-[0.2em] mb-1.5"
        style={{ color: CHAT_MUTED, fontFamily: "'JetBrains Mono', monospace" }}
      >
        quan
      </span>
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block w-[3px] h-[3px] rounded-full"
            style={{
              background: CHAT_MUTED,
              animation: "quanDot 1.1s ease-in-out infinite",
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function App() {
  const [history, setHistory] = useState<HistoryLine[]>(WELCOME_LINES);
  const [input, setInput] = useState("");
  const [dir, setDir] = useState<DirectoryState>("home");
  const [mode, setMode] = useState<Mode>("terminal");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [aiConversation, setAiConversation] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const turnIdRef = useRef(0);

  const nextTurnId = () => {
    turnIdRef.current += 1;
    return turnIdRef.current;
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, chatTurns, isAiTyping]);

  const appendLines = (lines: HistoryLine[]) => {
    setHistory((prev) => [...prev, ...lines]);
  };

  const handleTerminalSubmit = () => {
    const raw = input.trim();
    const promptLine: HistoryLine = {
      id: Date.now() - 1,
      type: "output",
      content: `\x1b[36m${DIR_PROMPTS[dir]}\x1b[0m ${raw}`,
    };

    if (raw !== "") {
      setCommandHistory((prev) => [raw, ...prev]);
    }
    setHistoryIndex(-1);
    setInput("");

    if (raw.toLowerCase() === "quan") {
      const launchLines: HistoryLine[] = [
        { id: Date.now(), type: "output", content: "" },
        { id: Date.now() + 1, type: "ai-output", content: "Launching Quan AI..." },
        { id: Date.now() + 2, type: "output", content: "" },
        { id: Date.now() + 3, type: "ai-output", content: "Hi, I'm Quan's AI portfolio assistant, powered by OpenAI." },
        { id: Date.now() + 4, type: "ai-output", content: "Ask me about Quan's experience, projects, skills, or background." },
        { id: Date.now() + 5, type: "ai-output", content: "Type exit to return to the terminal." },
        { id: Date.now() + 6, type: "output", content: "" },
      ];
      setHistory((prev) => [...prev, promptLine, ...launchLines]);
      setAiConversation([]);
      setChatTurns([
        { id: nextTurnId(), role: "system", content: "Entered Quan AI mode", time: formatTime(new Date()) },
        {
          id: nextTurnId(),
          role: "assistant",
          content:
            "Hi — I'm Quan's AI assistant, running on the OpenAI API.\nAsk about his experience, projects, skills, or background. Press Ctrl+C or type exit whenever you're done.",
          time: formatTime(new Date()),
        },
      ]);
      setMode("ai");
      return;
    }

    const { lines, clearAll } = processCommand(raw, dir, setDir);

    if (clearAll) {
      clearTerminal();
    } else {
      setHistory((prev) => [...prev, promptLine, ...lines]);
    }
  };

  const clearTerminal = () => {
    setHistory([...WELCOME_LINES]);
    setInput("");
  };

  const exitAiMode = (label = "exit") => {
    const exitLines: HistoryLine[] = [
      { id: Date.now(), type: "ai-command", content: label },
      { id: Date.now() + 1, type: "output", content: "" },
      { id: Date.now() + 2, type: "output", content: "Returning to terminal mode..." },
      { id: Date.now() + 3, type: "output", content: "" },
    ];
    appendLines(exitLines);
    setMode("terminal");
    setInput("");
    setIsAiTyping(false);
  };

  const handleAiSubmit = async () => {
    const raw = input.trim();
    setInput("");
    setHistoryIndex(-1);

    if (raw === "") return;

    if (raw.toLowerCase() === "exit") {
      exitAiMode("exit");
      return;
    }

    if (raw !== "") {
      setCommandHistory((prev) => [raw, ...prev]);
    }

    const userLine: HistoryLine = { id: Date.now(), type: "ai-command", content: raw };
    appendLines([userLine]);
    setChatTurns((prev) => [...prev, { id: nextTurnId(), role: "user", content: raw, time: formatTime(new Date()) }]);
    setIsAiTyping(true);

    try {
      const response = await fetch(CHAT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: raw, history: aiConversation }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = await response.json();
      const reply: string = data.reply || "Sorry, I didn't get a response.";

      setAiConversation((prev) => [
        ...prev,
        { role: "user", content: raw },
        { role: "assistant", content: reply },
      ]);

      setChatTurns((prev) => [
        ...prev,
        { id: nextTurnId(), role: "assistant", content: reply, time: formatTime(new Date()) },
      ]);

      const replyLines = reply.split("\n");
      appendLines([
        { id: Date.now(), type: "output", content: "" },
        ...replyLines.map((r, i) => ({
          id: Date.now() + i + 1,
          type: "ai-output" as LineType,
          content: r,
        })),
        { id: Date.now() + replyLines.length + 1, type: "output", content: "" },
      ]);
    } catch (err) {
      const errorMessage = "Couldn't reach the AI assistant backend. Is the server running on localhost:3001?";

      setChatTurns((prev) => [
        ...prev,
        { id: nextTurnId(), role: "error", content: errorMessage, time: formatTime(new Date()) },
      ]);

      appendLines([
        { id: Date.now(), type: "output", content: "" },
        { id: Date.now() + 1, type: "error", content: `\x1b[31m${errorMessage}\x1b[0m` },
        { id: Date.now() + 2, type: "output", content: "" },
      ]);
    } finally {
      setIsAiTyping(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey && e.key.toLowerCase() === "c") {
      e.preventDefault();
      if (mode === "ai") {
        exitAiMode("^C");
      }
      return;
    }
    if (e.ctrlKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      clearTerminal();
      return;
    }
    if (e.key === "Enter") {
      mode === "terminal" ? handleTerminalSubmit() : handleAiSubmit();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (mode !== "terminal") return;

      const candidates = getCompletions(input, dir);
      if (candidates.length === 0) return;

      const completed = applyCompletion(input, candidates);

      if (completed === input && candidates.length > 1) {
        appendLines([
          { id: Date.now(), type: "output", content: "" },
          { id: Date.now() + 1, type: "output", content: candidates.join("    ") },
          { id: Date.now() + 2, type: "output", content: "" },
        ]);
        return;
      }

      setInput(completed);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(historyIndex + 1, commandHistory.length - 1);
      setHistoryIndex(next);
      setInput(commandHistory[next] ?? "");
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.max(historyIndex - 1, -1);
      setHistoryIndex(next);
      setInput(next === -1 ? "" : commandHistory[next]);
    }
  };

  const prompt = mode === "ai" ? "quan-ai>" : DIR_PROMPTS[dir];
  const promptColor = mode === "ai" ? "text-purple-400" : "text-cyan-400";
  const showSuggestions = mode === "ai" && chatTurns.filter((t) => t.role === "user").length === 0;

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-8"
      style={{ background: "#0c0e12", fontFamily: "'JetBrains Mono', monospace" }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Terminal / Chat window */}
      <div
        key={mode}
        className="quan-mode-enter w-full max-w-3xl flex flex-col rounded-xl overflow-hidden shadow-2xl"
        style={
          mode === "ai"
            ? {
                background: CHAT_BG,
                border: "1px solid rgba(255,255,255,0.07)",
                minHeight: "520px",
                maxHeight: "78vh",
                boxShadow: "0 32px 80px rgba(0,0,0,0.75)",
              }
            : {
                background: "#161b22",
                border: "1px solid rgba(255,255,255,0.08)",
                minHeight: "520px",
                maxHeight: "78vh",
                boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
              }
        }
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div
          className="flex items-center px-4 py-3 flex-shrink-0"
          style={
            mode === "ai"
              ? { background: CHAT_SURFACE, borderBottom: `1px solid ${CHAT_LINE}` }
              : { background: "#1f2428", borderBottom: "1px solid rgba(255,255,255,0.06)" }
          }
        >
          {mode === "ai" ? (
            <div className="flex items-center gap-2 mr-3">
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: "#7CB88F" }}
                title="Online"
              />
            </div>
          ) : (
            <div className="flex gap-2 mr-4">
              <div
                className="w-3 h-3 rounded-full flex items-center justify-center group cursor-pointer"
                style={{ background: "#ff5f57" }}
                title="Close"
              />
              <div
                className="w-3 h-3 rounded-full flex items-center justify-center group cursor-pointer"
                style={{ background: "#febc2e" }}
                title="Minimize"
              />
              <div
                className="w-3 h-3 rounded-full flex items-center justify-center group cursor-pointer"
                style={{ background: "#28c840" }}
                title="Maximize"
              />
            </div>
          )}
          {/* Title */}
          <div
            className="flex-1 text-center text-xs"
            style={{
              color: mode === "ai" ? CHAT_MUTED : "#6e7681",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: mode === "ai" ? "0.08em" : undefined,
            }}
          >
            {mode === "ai" ? "quan / ai-assistant" : `quan@portfolio — ${DIR_PROMPTS[dir].split("$")[0]}`}
          </div>
          <div className="w-16" />
        </div>

        {/* Output area */}
        <div
          className="flex-1 overflow-y-auto px-4 sm:px-6 py-4"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: mode === "ai" ? "rgba(255,255,255,0.12) transparent" : "rgba(255,255,255,0.1) transparent",
          }}
        >
          {mode === "terminal" ? (
            <div className="space-y-px">
              {history.map((line) => (
                <div key={line.id} className="flex">
                  {(line.type === "output" || line.type === "error" || line.type === "ai-output" || line.type === "about") && (
                    <TerminalLine line={line} />
                  )}
                  {line.type === "welcome" && <TerminalLine line={line} />}
                  {line.type === "command" && <TerminalLine line={line} />}
                  {line.type === "ai-command" && <TerminalLine line={line} />}
                </div>
              ))}
            </div>
          ) : (
            <div>
              {chatTurns.map((turn, i) => (
                <ChatBubble key={turn.id} turn={turn} index={i} />
              ))}

              {showSuggestions && !isAiTyping && (
                <div className="chat-turn-enter flex flex-wrap gap-2 mt-1 mb-2">
                  {SUGGESTION_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => {
                        setInput(chip);
                        inputRef.current?.focus();
                      }}
                      className="text-[11px] px-3 py-1.5 rounded-md transition-colors"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        color: CHAT_MUTED,
                        background: "transparent",
                        border: `1px solid ${CHAT_LINE}`,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = CHAT_TEXT;
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = CHAT_MUTED;
                        e.currentTarget.style.borderColor = CHAT_LINE;
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}

              {isAiTyping && <TypingIndicator />}
            </div>
          )}

          {/* AI typing indicator (terminal mode legacy line, unused visually in ai mode now) */}

          {/* Input row */}
          {!isAiTyping && mode === "terminal" && (
            <div className="flex items-center mt-1">
              <span className={`text-sm font-mono mr-2 flex-shrink-0 ${promptColor}`}>
                {prompt}
              </span>
              <div className="relative flex-1 flex items-center">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="flex-1 bg-transparent outline-none text-sm font-mono caret-transparent"
                  style={{
                    color: "#c9d1d9",
                    fontFamily: "'JetBrains Mono', monospace",
                    caretColor: "transparent",
                  }}
                  aria-label="Terminal input"
                />
                {/* Blinking block cursor */}
                <span
                  className="inline-block w-2 h-4 ml-0 flex-shrink-0"
                  style={{
                    background: "#22d3ee",
                    animation: "blink 1s step-end infinite",
                  }}
                />
              </div>
            </div>
          )}

          {!isAiTyping && mode === "ai" && (
            <div
              className="chat-turn-enter flex items-center gap-2 mt-4 pt-3"
              style={{ borderTop: `1px solid ${CHAT_LINE}` }}
            >
              <span
                className="text-[13px] flex-shrink-0"
                style={{ color: CHAT_MUTED, fontFamily: "'JetBrains Mono', monospace" }}
              >
                &gt;
              </span>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="ask about experience, projects, skills…"
                className="flex-1 bg-transparent outline-none text-[13px]"
                style={{
                  color: CHAT_TEXT,
                  fontFamily: "'JetBrains Mono', monospace",
                  caretColor: CHAT_TEXT,
                }}
                aria-label="AI chat input"
              />
              <span
                className="text-[10px] flex-shrink-0"
                style={{ color: CHAT_MUTED, fontFamily: "'JetBrains Mono', monospace" }}
              >
                ↵
              </span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Footer */}
      <p
        className="mt-6 text-xs text-center"
        style={{ color: "#3d444d", fontFamily: "'JetBrains Mono', monospace" }}
      >
        © 2026 Quan Do — Built with TypeScript, Vite, and a fake terminal.
      </p>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes quanDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-3px); opacity: 1; }
        }
        @keyframes quanModeEnter {
          from { opacity: 0; transform: scale(0.985) translateY(8px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes quanTurnEnter {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: none; }
        }
        .quan-mode-enter {
          animation: quanModeEnter 420ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .chat-turn-enter {
          animation: quanTurnEnter 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        ::-webkit-scrollbar {
          width: 4px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.08);
          border-radius: 2px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.15);
        }
      `}</style>
    </div>
  );
}
