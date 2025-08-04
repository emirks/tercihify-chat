import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { Message } from "ai";

interface SummarizationConfig {
  maxTokens: number;
  keepRecentMessages: number;
  summaryModel: string;
}

interface ConversationSummary {
  summary: string;
  originalMessageCount: number;
  summarizedAt: string;
  tokensSaved: number;
}

export class ConversationSummarizer {
  private config: SummarizationConfig;

  constructor(config: Partial<SummarizationConfig> = {}) {
    this.config = {
      maxTokens: parseInt(process.env.CONVERSATION_MAX_TOKENS || "8000"),
      keepRecentMessages: parseInt(process.env.CONVERSATION_KEEP_RECENT || "6"),
      summaryModel:
        process.env.CONVERSATION_SUMMARY_MODEL || "claude-3-5-haiku-20241022",
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
        return sum + JSON.stringify(part).length;
      }, 0);
      return total + content.length + partsSize;
    }, 0);

    return Math.ceil(contentSize / 4);
  }

  /**
   * Checks if conversation needs summarization
   * Currently disabled - always returns false to skip summarization
   */
  shouldSummarize(_messages: Message[]): boolean {
    // Temporarily disabled - return false to skip summarization
    return false;

    // Original logic (commented out for later use):
    // const estimatedTokens = this.estimateTokens(messages);
    // return estimatedTokens > this.config.maxTokens && messages.length > this.config.keepRecentMessages;
  }

  /**
   * Summarizes conversation history, keeping recent messages intact
   */
  async summarizeConversation(messages: Message[]): Promise<{
    summarizedMessages: Message[];
    summary: ConversationSummary;
  }> {
    if (!this.shouldSummarize(messages)) {
      return {
        summarizedMessages: messages,
        summary: {
          summary: "",
          originalMessageCount: 0,
          summarizedAt: new Date().toISOString(),
          tokensSaved: 0,
        },
      };
    }

    // Split messages: older ones to summarize + recent ones to keep
    const messagesToSummarize = messages.slice(
      0,
      -this.config.keepRecentMessages,
    );
    const recentMessages = messages.slice(-this.config.keepRecentMessages);

    // Extract conversation content for summarization
    const conversationText = messagesToSummarize
      .map((msg) => {
        const role = msg.role === "user" ? "User" : "Assistant";
        let content =
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content);

        // Extract text from parts if available
        const parts = (msg as any).parts || [];
        const textParts = parts
          .filter((part: any) => part.type === "text")
          .map((part: any) => part.text)
          .join(" ");

        if (textParts) content = textParts;

        return `${role}: ${content}`;
      })
      .join("\n\n");

    // Generate summary using Claude 3.5 Haiku
    const summaryPrompt = `Summarize this Turkish university guidance conversation concisely. Focus on:
- Key university programs or topics discussed
- User's preferences, scores, or requirements mentioned
- Important guidance provided
- Ongoing requests or decisions

Keep the summary under 200 words and preserve context essential for continuing the university guidance conversation.

Conversation:
${conversationText}`;

    try {
      const { text: summaryText } = await generateText({
        model: anthropic(this.config.summaryModel),
        prompt: summaryPrompt,
        maxTokens: 300,
        temperature: 0.2, // Lower temperature for more focused summaries
      });

      // Calculate tokens saved
      const originalTokens = this.estimateTokens(messagesToSummarize);
      const summaryTokens = Math.ceil(summaryText.length / 4);
      const tokensSaved = originalTokens - summaryTokens;

      // Create summary message
      const summaryMessage: Message = {
        id: `summary-${Date.now()}`,
        role: "system",
        content: `[Conversation Summary: ${summaryText}]`,
      };

      const summary: ConversationSummary = {
        summary: summaryText,
        originalMessageCount: messagesToSummarize.length,
        summarizedAt: new Date().toISOString(),
        tokensSaved,
      };

      return {
        summarizedMessages: [summaryMessage, ...recentMessages],
        summary,
      };
    } catch (error) {
      console.error("Failed to summarize conversation with Claude:", error);
      // Return original messages if summarization fails
      return {
        summarizedMessages: messages,
        summary: {
          summary: "",
          originalMessageCount: 0,
          summarizedAt: new Date().toISOString(),
          tokensSaved: 0,
        },
      };
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): SummarizationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SummarizationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}

export const conversationSummarizer = new ConversationSummarizer();
