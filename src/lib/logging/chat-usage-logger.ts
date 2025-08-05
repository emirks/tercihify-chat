import { format } from "date-fns";
import { pgUsageRepository } from "@/lib/db/pg/repositories/usage-repository.pg";

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
  private currentLog: ChatUsageLog | null = null;
  private captureContent: boolean = true;
  private persistToFile: boolean = true; // Keep file persistence for compatibility
  private logsDir: string = "logs/chat-usage";

  constructor(captureContent = true, persistToFile = true) {
    this.captureContent = captureContent;
    this.persistToFile = persistToFile;
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

    // Save to database
    try {
      await pgUsageRepository.createUsageLogWithSteps(
        {
          sessionId: this.currentLog.sessionId,
          messageId: this.currentLog.messageId,
          timestamp: this.currentLog.timestamp,
          userId: this.currentLog.userId,
          model: this.currentLog.model,
          totalPromptTokens: this.currentLog.totalPromptTokens,
          totalCompletionTokens: this.currentLog.totalCompletionTokens,
          totalTokens: this.currentLog.totalTokens,
          totalExecutionTime: this.currentLog.totalExecutionTime,
          requestSize: this.currentLog.requestSize,
          responseSize: this.currentLog.responseSize,
          fullConversationContext: this.currentLog.fullConversationContext,
        },
        this.currentLog.steps,
      );

      console.log("Chat usage log saved to database");
    } catch (error) {
      console.error("Failed to save chat usage log to database:", error);
      // Fallback to file persistence if enabled
      if (this.persistToFile) {
        await this.saveLog();
      }
    }

    this.currentLog = null;
  }

  private async saveLog(): Promise<void> {
    if (!this.currentLog) return;

    try {
      // Import file system modules only when needed (since this is fallback)
      const fs = await import("fs/promises");
      const path = await import("path");

      // Create directory structure: logs/chat-usage/{sessionId}/
      const sessionDir = path.join(this.logsDir);
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
      console.log(`Chat usage log saved to file: ${filePath}`);

      // Log key metrics to console for immediate visibility
      if (this.currentLog.fullConversationContext) {
        const ctx = this.currentLog.fullConversationContext;
        const modelInfo = this.currentLog.model;

        // Check if summarization occurred
        const summarizationStep = this.currentLog.steps.find(
          (step) => step.stepName === "conversation_summarization",
        );

        if (ctx) {
          console.log(
            `📊 Token Analysis - ${this.currentLog.sessionId} | Model: ${modelInfo}`,
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
      console.error("Failed to save chat usage log to file:", error);
    }
  }

  private getStringSize(str: string): number {
    return new Blob([str]).size;
  }

  private getObjectSize(obj: any): number {
    return new Blob([JSON.stringify(obj)]).size;
  }

  // Static method to get usage analytics for a session from database
  static async getSessionAnalytics(sessionId: string) {
    try {
      const usageData = await pgUsageRepository.getSessionUsage(sessionId);
      return usageData;
    } catch (error) {
      console.error("Failed to get session analytics:", error);
      return null;
    }
  }

  // Static method to get recent high-usage sessions from database
  static async getHighUsageSessions(limit = 10) {
    try {
      const highUsageSessions =
        await pgUsageRepository.getHighUsageSessions(limit);
      return highUsageSessions;
    } catch (error) {
      console.error("Failed to get high usage sessions:", error);
      return [];
    }
  }

  // Static method to get hourly usage data from database
  static async getHourlyUsage(hours = 24) {
    try {
      const hourlyUsage = await pgUsageRepository.getHourlyUsage(hours);
      return hourlyUsage;
    } catch (error) {
      console.error("Failed to get hourly usage:", error);
      return [];
    }
  }

  // Static method to get available hourly data (shows actual data instead of empty)
  static async getAvailableHourlyData() {
    try {
      const hourlyUsage = await pgUsageRepository.getAvailableHourlyData();
      return hourlyUsage;
    } catch (error) {
      console.error("Failed to get available hourly data:", error);
      return [];
    }
  }

  // Static method to get per-minute usage for last hour
  static async getMinuteUsage(minutes = 60) {
    try {
      const minuteUsage = await pgUsageRepository.getMinuteUsage(minutes);
      return minuteUsage;
    } catch (error) {
      console.error("Failed to get minute usage:", error);
      return [];
    }
  }

  // Static method to get available per-minute data (shows actual data instead of empty)
  static async getAvailableMinuteData() {
    try {
      const minuteUsage = await pgUsageRepository.getAvailableMinuteData();
      return minuteUsage;
    } catch (error) {
      console.error("Failed to get available minute data:", error);
      return [];
    }
  }

  // Static method to get token usage summary with filters
  static async getTokenUsageSummary(filters: any) {
    try {
      return await pgUsageRepository.getTokenUsageSummary(filters);
    } catch (error) {
      console.error("Failed to get token usage summary:", error);
      return null;
    }
  }
}

export const chatUsageLogger = new ChatUsageLogger();
