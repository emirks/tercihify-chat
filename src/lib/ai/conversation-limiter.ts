import { Message } from "ai";

interface ConversationLimiterConfig {
  maxTokens: number;
  preserveSystemMessages: boolean;
}

interface LimitationResult {
  limitedMessages: Message[];
  originalCount: number;
  limitedCount: number;
  tokensRemoved: number;
  tokensSaved: number;
}

export class ConversationLimiter {
  private config: ConversationLimiterConfig;

  constructor(config: Partial<ConversationLimiterConfig> = {}) {
    this.config = {
      maxTokens: parseInt(process.env.CONVERSATION_MAX_TOKENS || "8000"),
      preserveSystemMessages: true,
      ...config,
    };
  }

  /**
   * Estimates token count for messages (rough approximation: 4 chars = 1 token)
   */
  private estimateTokens(messages: Message[]): number {
    const contentSize = messages.reduce((total, msg) => {
      const content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
      const parts = (msg as any).parts || [];
      const partsSize = parts.reduce((sum: number, part: any) => {
        if (part.type === "text") return sum + (part.text?.length || 0);
        if (part.type === "tool-invocation") {
          // Include tool calls but not results (results should be cleaned separately)
          const toolCall = {
            toolName: part.toolInvocation?.toolName,
            args: part.toolInvocation?.args,
          };
          return sum + JSON.stringify(toolCall).length;
        }
        return sum + JSON.stringify(part).length;
      }, 0);
      return total + content.length + partsSize;
    }, 0);

    return Math.ceil(contentSize / 4);
  }

  /**
   * Estimates tokens for a single message
   */
  private estimateMessageTokens(message: Message): number {
    return this.estimateTokens([message]);
  }

  /**
   * Checks if conversation needs limiting
   */
  shouldLimit(messages: Message[]): boolean {
    const estimatedTokens = this.estimateTokens(messages);
    return estimatedTokens > this.config.maxTokens;
  }

  /**
   * Limits conversation to last N tokens using sliding window approach
   */
  limitConversation(messages: Message[]): LimitationResult {
    const originalTokens = this.estimateTokens(messages);

    if (!this.shouldLimit(messages)) {
      return {
        limitedMessages: messages,
        originalCount: messages.length,
        limitedCount: messages.length,
        tokensRemoved: 0,
        tokensSaved: 0,
      };
    }

    // Separate system messages if we want to preserve them
    const systemMessages = this.config.preserveSystemMessages
      ? messages.filter((msg) => msg.role === "system")
      : [];

    const nonSystemMessages = this.config.preserveSystemMessages
      ? messages.filter((msg) => msg.role !== "system")
      : messages;

    // Start from the end and work backwards, keeping messages until we hit the token limit
    const limitedMessages: Message[] = [];
    let currentTokens = 0;

    // Add system messages first if preserving them
    if (this.config.preserveSystemMessages && systemMessages.length > 0) {
      const systemTokens = this.estimateTokens(systemMessages);
      if (systemTokens < this.config.maxTokens) {
        limitedMessages.push(...systemMessages);
        currentTokens += systemTokens;
      }
    }

    // Add non-system messages from the end, working backwards
    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
      const message = nonSystemMessages[i];
      const messageTokens = this.estimateMessageTokens(message);

      // Check if adding this message would exceed the limit
      if (currentTokens + messageTokens > this.config.maxTokens) {
        break;
      }

      limitedMessages.unshift(message);
      currentTokens += messageTokens;
    }

    // If we only have system messages and they're too big, truncate them too
    if (
      limitedMessages.length === systemMessages.length &&
      currentTokens > this.config.maxTokens
    ) {
      // Keep only the most recent system message
      const recentSystemMessage = systemMessages[systemMessages.length - 1];
      const recentSystemTokens =
        this.estimateMessageTokens(recentSystemMessage);

      if (recentSystemTokens <= this.config.maxTokens) {
        return {
          limitedMessages: [recentSystemMessage],
          originalCount: messages.length,
          limitedCount: 1,
          tokensRemoved: messages.length - 1,
          tokensSaved: originalTokens - recentSystemTokens,
        };
      }
    }

    const finalTokens = this.estimateTokens(limitedMessages);

    return {
      limitedMessages,
      originalCount: messages.length,
      limitedCount: limitedMessages.length,
      tokensRemoved: messages.length - limitedMessages.length,
      tokensSaved: originalTokens - finalTokens,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): ConversationLimiterConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ConversationLimiterConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

export const conversationLimiter = new ConversationLimiter();
