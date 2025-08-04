import { promises as fs } from "fs";
import path from "path";
import { format } from "date-fns";

export interface ChatUsageStep {
  stepName: string;
  timestamp: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  systemPromptSize?: number;
  messagesCount?: number;
  toolsCount?: number;
  mcpToolsCount?: number;
  workflowToolsCount?: number;
  appDefaultToolsCount?: number;
  toolCallResults?: Array<{
    toolName: string;
    resultSize: number;
    executionTime: number;
  }>;
  promptSizeBreakdown?: {
    userSystemPrompt?: number;
    mcpCustomizations?: number;
    thinkingPrompt?: number;
    agentInstructions?: number;
    total: number;
  };
  // NEW: Actual content fields for debugging
  actualContent?: {
    systemPrompt?: string;
    userMessages?: Array<{
      role: string;
      content: string;
      parts?: any[];
    }>;
    assistantResponse?: string;
    toolCalls?: Array<{
      name: string;
      args: any;
      result: any;
    }>;
  };
  additionalData?: Record<string, any>;
}

export interface ChatUsageLog {
  sessionId: string;
  messageId: string;
  timestamp: number;
  userId: string;
  model: string;
  steps: ChatUsageStep[];
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  totalExecutionTime: number;
  requestSize: number;
  responseSize: number;
  // NEW: Complete conversation context
  fullConversationContext?: {
    systemPrompt: string;
    messages: Array<{
      role: string;
      content: string;
      timestamp?: number;
    }>;
    finalResponse: string;
    tokensBreakdown: {
      systemPromptActual: number;
      messagesContentActual: number;
      toolsAndOverheadActual: number;
      responseActual: number;
      total: number;
    };
    // NEW: Detailed overhead analysis
    overheadAnalysis?: {
      totalPromptTokens: number;
      systemPromptTokens: number;
      messagesContentTokens: number;
      calculatedOverhead: number;
      messageStructureSize: number;
      estimatedMessageStructureTokens: number;
      possibleUnaccountedTokens: number;
    };
  };
}

export class ChatUsageLogger {
  private logsDir: string;
  private currentLog: ChatUsageLog | null = null;
  private captureContent: boolean;
  private sessionMapping: Map<string, string> = new Map(); // sessionId -> folderName mapping
  private sessionCounter: number = 0;

  constructor(basePath = "logs/chat-usage", captureContent = true) {
    this.logsDir = basePath;
    this.captureContent = captureContent;
    this.loadSessionMapping();
  }

  private async loadSessionMapping(): Promise<void> {
    try {
      const mappingPath = path.join(this.logsDir, "session_mapping.json");
      const mappingData = await fs.readFile(mappingPath, "utf-8");
      const data = JSON.parse(mappingData);
      this.sessionMapping = new Map(Object.entries(data.mapping || {}));
      this.sessionCounter = data.counter || 0;
    } catch {
      // File doesn't exist yet, start fresh
      this.sessionMapping = new Map();
      this.sessionCounter = 0;
    }
  }

  private async saveSessionMapping(): Promise<void> {
    try {
      await fs.mkdir(this.logsDir, { recursive: true });
      const mappingPath = path.join(this.logsDir, "session_mapping.json");
      const data = {
        counter: this.sessionCounter,
        mapping: Object.fromEntries(this.sessionMapping),
        lastUpdated: new Date().toISOString(),
      };
      await fs.writeFile(mappingPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error("Failed to save session mapping:", error);
    }
  }

  private getSessionFolderName(sessionId: string): string {
    if (!this.sessionMapping.has(sessionId)) {
      this.sessionCounter++;
      const folderName = `session_${this.sessionCounter.toString().padStart(3, "0")}`;
      this.sessionMapping.set(sessionId, folderName);
      // Save mapping asynchronously
      this.saveSessionMapping().catch(console.error);
    }
    return this.sessionMapping.get(sessionId)!;
  }

  async initializeLog(params: {
    sessionId: string;
    messageId: string;
    userId: string;
    model: string;
    requestSize?: number;
  }): Promise<void> {
    this.currentLog = {
      sessionId: params.sessionId,
      messageId: params.messageId,
      timestamp: Date.now(),
      userId: params.userId,
      model: params.model,
      steps: [],
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      totalExecutionTime: 0,
      requestSize: params.requestSize || 0,
      responseSize: 0,
    };
  }

  addStep(step: ChatUsageStep): void {
    if (!this.currentLog) {
      console.warn("ChatUsageLogger: No active log session");
      return;
    }

    this.currentLog.steps.push(step);

    // Update totals
    if (step.promptTokens)
      this.currentLog.totalPromptTokens += step.promptTokens;
    if (step.completionTokens)
      this.currentLog.totalCompletionTokens += step.completionTokens;
    if (step.totalTokens) this.currentLog.totalTokens += step.totalTokens;
  }

  async logSystemPromptBreakdown(breakdown: {
    userSystemPrompt: string;
    mcpCustomizations: string;
    thinkingPrompt?: string;
    agentInstructions?: string;
    fullPrompt: string;
  }): Promise<void> {
    const sizeBreakdown = {
      userSystemPrompt: this.getStringSize(breakdown.userSystemPrompt),
      mcpCustomizations: this.getStringSize(breakdown.mcpCustomizations),
      thinkingPrompt: breakdown.thinkingPrompt
        ? this.getStringSize(breakdown.thinkingPrompt)
        : 0,
      agentInstructions: breakdown.agentInstructions
        ? this.getStringSize(breakdown.agentInstructions)
        : 0,
      total: this.getStringSize(breakdown.fullPrompt),
    };

    this.addStep({
      stepName: "system_prompt_analysis",
      timestamp: Date.now(),
      systemPromptSize: sizeBreakdown.total,
      promptSizeBreakdown: sizeBreakdown,
      // NEW: Include actual prompt content for debugging
      actualContent: this.captureContent
        ? {
            systemPrompt: breakdown.fullPrompt,
          }
        : undefined,
      additionalData: {
        estimatedTokens: Math.ceil(sizeBreakdown.total / 4), // Rough estimate: 4 chars = 1 token
        promptComponentSizes: {
          userSystemPrompt: sizeBreakdown.userSystemPrompt,
          mcpCustomizations: sizeBreakdown.mcpCustomizations,
          thinkingPrompt: sizeBreakdown.thinkingPrompt,
          agentInstructions: sizeBreakdown.agentInstructions,
        },
      },
    });
  }

  async logUserMessages(
    messages: Array<{ role: string; content?: string; parts?: any[] }>,
  ): Promise<void> {
    if (!this.captureContent) return;

    const processedMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content || "",
      parts: msg.parts || [],
    }));

    this.addStep({
      stepName: "user_messages_captured",
      timestamp: Date.now(),
      messagesCount: messages.length,
      actualContent: {
        userMessages: processedMessages,
      },
      additionalData: {
        totalMessageSize: processedMessages.reduce(
          (sum, msg) => sum + this.getStringSize(JSON.stringify(msg)),
          0,
        ),
      },
    });
  }

  async logFinalResponse(response: {
    content: string;
    toolCalls?: Array<{ name: string; args: any; result: any }>;
  }): Promise<void> {
    if (!this.captureContent) return;

    this.addStep({
      stepName: "final_response_captured",
      timestamp: Date.now(),
      actualContent: {
        assistantResponse: response.content,
        toolCalls: response.toolCalls || [],
      },
      additionalData: {
        responseSize: this.getStringSize(response.content),
        toolCallsCount: response.toolCalls?.length || 0,
      },
    });
  }

  async logToolCallResult(params: {
    toolName: string;
    result: any;
    executionTime: number;
    args?: any;
  }): Promise<void> {
    const resultSize = this.getObjectSize(params.result);

    this.addStep({
      stepName: "tool_call",
      timestamp: Date.now(),
      toolCallResults: [
        {
          toolName: params.toolName,
          resultSize,
          executionTime: params.executionTime,
        },
      ],
      // NEW: Include actual tool call data
      actualContent: this.captureContent
        ? {
            toolCalls: [
              {
                name: params.toolName,
                args: params.args,
                result: params.result,
              },
            ],
          }
        : undefined,
      additionalData: {
        estimatedTokensFromResult: Math.ceil(resultSize / 4),
        resultType: typeof params.result,
        resultStringified: typeof params.result === "object",
      },
    });
  }

  async logFullConversationContext(context: {
    systemPrompt: string;
    messages: Array<{ role: string; content: string; parts?: any[] }>;
    finalResponse: string;
    actualTokens: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }): Promise<void> {
    if (!this.currentLog || !this.captureContent) return;

    // Extract actual message content from parts if available
    const processedMessages = context.messages.map((msg) => {
      let actualContent = msg.content;

      // If content is empty but parts exist, extract from parts
      if (!actualContent && msg.parts && Array.isArray(msg.parts)) {
        const textParts = msg.parts
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(" ");
        actualContent = textParts || msg.content;
      }

      return {
        role: msg.role,
        content: actualContent,
        timestamp: Date.now(),
      };
    });

    // Calculate actual content sizes for better token estimation
    const systemPromptSize = this.getStringSize(context.systemPrompt);
    const messagesContentSize = processedMessages.reduce(
      (sum, msg) => sum + this.getStringSize(msg.content),
      0,
    );
    const responseSize = this.getStringSize(context.finalResponse);

    // More accurate token breakdown estimation
    // System prompt tokens are roughly fixed based on its size
    const estimatedSystemTokens = Math.ceil(systemPromptSize / 4);
    const estimatedResponseTokens = context.actualTokens.completionTokens;

    // Messages content tokens (just the actual message text)
    const estimatedMessageContentTokens = Math.ceil(messagesContentSize / 4);

    // Tool definitions and overhead = remaining tokens after accounting for system prompt and message content
    const toolsAndOverheadTokens = Math.max(
      0,
      context.actualTokens.promptTokens -
        estimatedSystemTokens -
        estimatedMessageContentTokens,
    );

    this.addStep({
      stepName: "token_breakdown_analysis",
      timestamp: Date.now(),
      additionalData: {
        contentSizes: {
          systemPromptBytes: systemPromptSize,
          messagesContentBytes: messagesContentSize,
          responseBytes: responseSize,
          totalContentBytes:
            systemPromptSize + messagesContentSize + responseSize,
        },
        tokenEstimates: {
          systemPromptEstimated: estimatedSystemTokens,
          messagesContentEstimated: estimatedMessageContentTokens,
          responseEstimated: estimatedResponseTokens,
          toolsAndOverheadEstimated: toolsAndOverheadTokens,
        },
        actualTokens: {
          promptTokens: context.actualTokens.promptTokens,
          completionTokens: context.actualTokens.completionTokens,
          totalTokens: context.actualTokens.totalTokens,
        },
        tokenEfficiency: {
          bytesToTokensRatio:
            context.actualTokens.totalTokens /
            (systemPromptSize + messagesContentSize + responseSize),
          systemPromptEfficiency:
            estimatedSystemTokens / context.actualTokens.promptTokens,
          messagesEfficiency:
            estimatedMessageContentTokens / context.actualTokens.promptTokens,
          toolsOverheadRatio:
            toolsAndOverheadTokens / context.actualTokens.promptTokens,
        },
      },
    });

    // Store conversation context
    this.currentLog.fullConversationContext = {
      systemPrompt: context.systemPrompt,
      messages: processedMessages,
      finalResponse: context.finalResponse,
      tokensBreakdown: {
        systemPromptActual: estimatedSystemTokens,
        messagesContentActual: estimatedMessageContentTokens,
        toolsAndOverheadActual: toolsAndOverheadTokens,
        responseActual: estimatedResponseTokens,
        total: context.actualTokens.totalTokens,
      },
      // NEW: Detailed overhead analysis
      overheadAnalysis: {
        totalPromptTokens: context.actualTokens.promptTokens,
        systemPromptTokens: estimatedSystemTokens,
        messagesContentTokens: estimatedMessageContentTokens,
        calculatedOverhead: toolsAndOverheadTokens,
        messageStructureSize: JSON.stringify(processedMessages).length,
        estimatedMessageStructureTokens: Math.ceil(
          JSON.stringify(processedMessages).length / 4,
        ),
        possibleUnaccountedTokens: Math.max(
          0,
          toolsAndOverheadTokens -
            Math.ceil(JSON.stringify(processedMessages).length / 4),
        ),
      },
    };
  }

  async logToolsLoaded(params: {
    mcpTools: Record<string, any>;
    workflowTools: Record<string, any>;
    appDefaultTools: Record<string, any>;
  }): Promise<void> {
    this.addStep({
      stepName: "tools_loaded",
      timestamp: Date.now(),
      mcpToolsCount: Object.keys(params.mcpTools).length,
      workflowToolsCount: Object.keys(params.workflowTools).length,
      appDefaultToolsCount: Object.keys(params.appDefaultTools).length,
      toolsCount:
        Object.keys(params.mcpTools).length +
        Object.keys(params.workflowTools).length +
        Object.keys(params.appDefaultTools).length,
      additionalData: {
        mcpToolNames: Object.keys(params.mcpTools),
        workflowToolNames: Object.keys(params.workflowTools),
        appDefaultToolNames: Object.keys(params.appDefaultTools),
        toolDefinitionsSize: this.getObjectSize({
          mcp: params.mcpTools,
          workflow: params.workflowTools,
          appDefault: params.appDefaultTools,
        }),
      },
    });
  }

  async logLLMUsage(params: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    stepName?: string;
  }): Promise<void> {
    this.addStep({
      stepName: params.stepName || "llm_call",
      timestamp: Date.now(),
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      totalTokens: params.totalTokens,
    });
  }

  async finalizeAndSave(responseSize?: number): Promise<void> {
    if (!this.currentLog) {
      console.warn("ChatUsageLogger: No active log session to finalize");
      return;
    }

    this.currentLog.responseSize = responseSize || 0;
    this.currentLog.totalExecutionTime = Date.now() - this.currentLog.timestamp;

    await this.saveLog();
    this.currentLog = null;
  }

  private async saveLog(): Promise<void> {
    if (!this.currentLog) return;

    try {
      // Create directory structure: logs/chat-usage/{sessionId}/
      const sessionDir = path.join(
        this.logsDir,
        this.getSessionFolderName(this.currentLog.sessionId),
      );
      await fs.mkdir(sessionDir, { recursive: true });

      // File name: YYYY-MM-DD_HH-mm-ss_{messageId-first8chars}.json
      const timestamp = format(
        new Date(this.currentLog.timestamp),
        "yyyy-MM-dd_HH-mm-ss",
      );
      const shortMessageId = this.currentLog.messageId.substring(0, 8);
      const fileName = `${timestamp}_msg-${shortMessageId}.json`;
      const filePath = path.join(sessionDir, fileName);

      // Save detailed log
      await fs.writeFile(filePath, JSON.stringify(this.currentLog, null, 2));

      // Also create/update session summary
      await this.updateSessionSummary();

      console.log(`Chat usage log saved: ${filePath}`);

      // Log key metrics to console for immediate visibility
      if (this.currentLog.fullConversationContext) {
        const ctx = this.currentLog.fullConversationContext;
        const modelInfo = this.currentLog.model;
        const sessionFolder = this.getSessionFolderName(
          this.currentLog.sessionId,
        );

        // Check if summarization occurred
        const summarizationStep = this.currentLog.steps.find(
          (step) => step.stepName === "conversation_summarization",
        );

        if (ctx) {
          console.log(
            `📊 Token Analysis - ${sessionFolder} | Model: ${modelInfo}`,
          );
          console.log(
            `   System Prompt: ${ctx.tokensBreakdown.systemPromptActual} tokens`,
          );
          console.log(
            `   Messages Content: ${ctx.tokensBreakdown.messagesContentActual} tokens`,
          );
          console.log(
            `   Tools & Overhead: ${ctx.tokensBreakdown.toolsAndOverheadActual} tokens`,
          );
          console.log(
            `   Response: ${ctx.tokensBreakdown.responseActual} tokens`,
          );
          console.log(`   Total: ${ctx.tokensBreakdown.total} tokens`);

          if (summarizationStep?.additionalData) {
            const summaryData = summarizationStep.additionalData;
            console.log(
              `📝 Summarization: ${summaryData.messagesCompressed} messages → summary (saved ~${summaryData.tokensSaved} tokens)`,
            );
          }
        }

        // Model-specific efficiency warnings
        if (
          modelInfo.includes("anthropic") &&
          ctx.tokensBreakdown.total > 10000
        ) {
          console.warn(
            `⚠️  High token usage on Anthropic: ${ctx.tokensBreakdown.total} tokens`,
          );
          console.log(
            `💡 Consider switching to Gemini Flash for better token efficiency`,
          );
        } else if (
          modelInfo.includes("google") &&
          ctx.tokensBreakdown.total > 8000
        ) {
          console.warn(
            `⚠️  High token usage on Gemini: ${ctx.tokensBreakdown.total} tokens`,
          );
        }

        if (ctx.tokensBreakdown.total > 10000) {
          console.warn(
            `⚠️  High token usage detected: ${ctx.tokensBreakdown.total} tokens`,
          );
        }
      }
    } catch (error) {
      console.error("Failed to save chat usage log:", error);
    }
  }

  private async updateSessionSummary(): Promise<void> {
    if (!this.currentLog) return;

    try {
      const sessionDir = path.join(
        this.logsDir,
        this.getSessionFolderName(this.currentLog.sessionId),
      );
      const summaryPath = path.join(sessionDir, "session_summary.json");

      let summary: any = {
        sessionId: this.currentLog.sessionId,
        totalMessages: 0,
        totalTokens: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        averageTokensPerMessage: 0,
        peakTokenUsage: 0,
        mostUsedTools: {},
        messages: [],
      };

      // Try to read existing summary
      try {
        const existingData = await fs.readFile(summaryPath, "utf-8");
        summary = JSON.parse(existingData);
      } catch {
        // File doesn't exist yet, use default summary
      }

      // Update summary with current log
      summary.totalMessages += 1;
      summary.totalTokens += this.currentLog.totalTokens;
      summary.totalPromptTokens += this.currentLog.totalPromptTokens;
      summary.totalCompletionTokens += this.currentLog.totalCompletionTokens;
      summary.averageTokensPerMessage =
        summary.totalTokens / summary.totalMessages;
      summary.peakTokenUsage = Math.max(
        summary.peakTokenUsage,
        this.currentLog.totalTokens,
      );

      // Track tool usage
      for (const step of this.currentLog.steps) {
        if (step.toolCallResults) {
          for (const toolCall of step.toolCallResults) {
            summary.mostUsedTools[toolCall.toolName] =
              (summary.mostUsedTools[toolCall.toolName] || 0) + 1;
          }
        }
      }

      // Add message summary
      summary.messages.push({
        messageId: this.currentLog.messageId,
        timestamp: this.currentLog.timestamp,
        totalTokens: this.currentLog.totalTokens,
        promptTokens: this.currentLog.totalPromptTokens,
        completionTokens: this.currentLog.totalCompletionTokens,
        executionTime: this.currentLog.totalExecutionTime,
        stepCount: this.currentLog.steps.length,
      });

      await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
    } catch (error) {
      console.error("Failed to update session summary:", error);
    }
  }

  private getStringSize(str: string): number {
    return new Blob([str]).size;
  }

  private getObjectSize(obj: any): number {
    return new Blob([JSON.stringify(obj)]).size;
  }

  // Static method to get usage analytics for a session
  static async getSessionAnalytics(
    sessionId: string,
    basePath = "logs/chat-usage",
  ): Promise<any> {
    try {
      // Load session mapping to find the correct folder
      const mappingPath = path.join(basePath, "session_mapping.json");
      let folderName = sessionId; // fallback to direct sessionId if mapping not found

      try {
        const mappingData = await fs.readFile(mappingPath, "utf-8");
        const data = JSON.parse(mappingData);
        const mapping = new Map(
          Object.entries((data.mapping as Record<string, string>) || {}),
        );
        folderName = mapping.get(sessionId) || sessionId;
      } catch {
        // Mapping file doesn't exist, try direct sessionId
      }

      const sessionDir = path.join(basePath, folderName);
      const summaryPath = path.join(sessionDir, "session_summary.json");

      const summaryData = await fs.readFile(summaryPath, "utf-8");
      return JSON.parse(summaryData);
    } catch (error) {
      console.error("Failed to get session analytics:", error);
      return null;
    }
  }

  // Static method to get recent high-usage sessions
  static async getHighUsageSessions(
    basePath = "logs/chat-usage",
    limit = 10,
  ): Promise<any[]> {
    try {
      const logsDir = basePath;
      const items = await fs.readdir(logsDir);

      // Filter to only include session folders (session_001, session_002, etc.)
      const sessionFolders = items.filter(
        (item) => item.startsWith("session_") && /^session_\d{3}$/.test(item),
      );

      const sessionSummaries = await Promise.all(
        sessionFolders.map(async (folderName) => {
          try {
            const summaryPath = path.join(
              logsDir,
              folderName,
              "session_summary.json",
            );
            const summaryData = await fs.readFile(summaryPath, "utf-8");
            const summary = JSON.parse(summaryData);
            // Add folder name for reference
            summary.folderName = folderName;
            return summary;
          } catch {
            return null;
          }
        }),
      );

      return sessionSummaries
        .filter(Boolean)
        .sort((a, b) => b.peakTokenUsage - a.peakTokenUsage)
        .slice(0, limit);
    } catch (error) {
      console.error("Failed to get high usage sessions:", error);
      return [];
    }
  }

  // New method to get session mapping for reference
  static async getSessionMapping(
    basePath = "logs/chat-usage",
  ): Promise<Map<string, string>> {
    try {
      const mappingPath = path.join(basePath, "session_mapping.json");
      const mappingData = await fs.readFile(mappingPath, "utf-8");
      const data = JSON.parse(mappingData);
      return new Map(
        Object.entries((data.mapping as Record<string, string>) || {}),
      );
    } catch {
      return new Map();
    }
  }
}

export const chatUsageLogger = new ChatUsageLogger();
