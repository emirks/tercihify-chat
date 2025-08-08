// models.ts
import { createOllama } from "ollama-ai-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { xai } from "@ai-sdk/xai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { LanguageModel } from "ai";
import {
  createOpenAICompatibleModels,
  openaiCompatibleModelsSafeParse,
} from "./create-openai-compatiable";
import { ChatModel } from "app-types/chat";

const _ollama = createOllama({
  baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/api",
});

// Configure OpenAI with organization ID if provided
const _openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  ...(process.env.OPENAI_ORG_ID && { organization: process.env.OPENAI_ORG_ID }),
});

// Configure Anthropic with API key
const _anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const staticModels = {
  openRouter: {
    // "qwen3-235b-a22b-2507": openrouter("qwen/qwen3-235b-a22b-2507"),
    // "qwen/qwen3-coder": openrouter("qwen/qwen3-coder"),
    // "openai/gpt-4.1": openrouter("openai/gpt-4.1"),
    // "openai/gpt-oss-120b": openrouter("openai/gpt-oss-120b"),
    // "openrouter/horizon-beta": openrouter("openrouter/horizon-beta"),
    "deepseek/deepseek-chat-v3-0324": openrouter(
      "deepseek/deepseek-chat-v3-0324:free",
      {
        models: [
          "openrouter/horizon-beta",
          "google/gemini-2.5-flash",
          "openai/gpt-4.1",
        ],
      },
    ),
    "openrouter/horizon": openrouter("openrouter/horizon-beta", {
      models: [
        "deepseek/deepseek-chat-v3-0324:free",
        "google/gemini-2.5-flash",
        "openai/gpt-4.1",
      ],
    }),
    "openai/gpt-oss-120b": openrouter("openai/gpt-oss-120b"),
  },
  google: {
    "gemini-2.5-pro": openrouter("google/gemini-2.5-pro"),
    "gemini-2.5-flash": openrouter("google/gemini-2.5-flash"),
  },
  anthropic: {
    "claude-4-sonnet": openrouter("anthropic/claude-sonnet-4"),
  },
  // openai: {
  //   "gpt-4o": _openai("gpt-4o"),
  //   "gpt-4.1": _openai("gpt-4.1"),
  //   "gpt-4.1-mini": _openai("gpt-4.1-mini"),
  // },
  // xai: {
  //   "grok-3": xai("grok-3-latest"),
  //   "grok-3-mini": xai("grok-3-mini-latest"),
  // },
  // ollama: {
  //   "gemma3:1b": _ollama("gemma3:1b"),
  //   "gemma3:4b": _ollama("gemma3:4b"),
  //   "gemma3:12b": _ollama("gemma3:12b"),
  // },
};

const staticUnsupportedModels = new Set([
  // staticModels.openai["o4-mini"],
  // staticModels.google["gemini-2.0-flash-lite"],
  // staticModels.ollama["gemma3:1b"],
  // staticModels.ollama["gemma3:4b"],
  // staticModels.ollama["gemma3:12b"],
]);

const openaiCompatibleProviders = openaiCompatibleModelsSafeParse(
  process.env.OPENAI_COMPATIBLE_DATA,
);

const {
  providers: openaiCompatibleModels,
  unsupportedModels: openaiCompatibleUnsupportedModels,
} = createOpenAICompatibleModels(openaiCompatibleProviders);

const allModels = { ...openaiCompatibleModels, ...staticModels };

const allUnsupportedModels = new Set([
  ...openaiCompatibleUnsupportedModels,
  ...staticUnsupportedModels,
]);

export const isToolCallUnsupportedModel = (model: LanguageModel) => {
  return allUnsupportedModels.has(model);
};

const firstProvider = Object.keys(allModels)[0];
const firstModel = Object.keys(allModels[firstProvider])[0];

const fallbackModel = allModels[firstProvider][firstModel];

export const customModelProvider = {
  modelsInfo: Object.entries(allModels).map(([provider, models]) => ({
    provider,
    models: Object.entries(models).map(([name, model]) => ({
      name,
      isToolCallUnsupported: isToolCallUnsupportedModel(model),
    })),
  })),
  getModel: (model?: ChatModel): LanguageModel => {
    if (!model) return fallbackModel;
    return allModels[model.provider]?.[model.model] || fallbackModel;
  },
};
