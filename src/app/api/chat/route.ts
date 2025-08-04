import {
  appendResponseMessages,
  createDataStreamResponse,
  smoothStream,
  streamText,
  type UIMessage,
  formatDataStreamPart,
  appendClientMessage,
  Message,
} from "ai";

import { customModelProvider, isToolCallUnsupportedModel } from "lib/ai/models";

import { mcpClientsManager } from "lib/ai/mcp/mcp-manager";

import { agentRepository, chatRepository } from "lib/db/repository";
import globalLogger from "logger";
import {
  buildMcpServerCustomizationsSystemPrompt,
  buildUserSystemPrompt,
  buildToolCallUnsupportedModelSystemPrompt,
  buildThinkingSystemPrompt,
} from "lib/ai/prompts";
import { chatApiSchemaRequestBodySchema } from "app-types/chat";

import { errorIf, safe } from "ts-safe";

import {
  appendAnnotations,
  excludeToolExecution,
  handleError,
  manualToolExecuteByLastMessage,
  mergeSystemPrompt,
  convertToMessage,
  extractInProgressToolPart,
  assignToolResult,
  filterMcpServerCustomizations,
  loadMcpTools,
  loadWorkFlowTools,
  loadAppDefaultTools,
} from "./shared.chat";
import {
  rememberAgentAction,
  rememberMcpServerCustomizationsAction,
} from "./actions";
import { getSession } from "auth/server";
import { colorize } from "consola/utils";
import { isVercelAIWorkflowTool } from "app-types/workflow";
import { SequentialThinkingToolName } from "lib/ai/tools";
import { sequentialThinkingTool } from "lib/ai/tools/thinking/sequential-thinking";
import { chatUsageLogger } from "lib/logging/chat-usage-logger";
import { conversationSummarizer } from "lib/ai/conversation-summarizer";
import { conversationLimiter } from "lib/ai/conversation-limiter";

const logger = globalLogger.withDefaults({
  message: colorize("blackBright", `Chat API: `),
});

// Helper function to clean tool results from message history
function cleanToolResultsFromMessages(messages: Message[]): Message[] {
  return messages.map((msg) => {
    // Convert to UIMessage-like structure to access parts
    const uiMsg = msg as any;

    if (!uiMsg.parts) {
      return msg;
    }

    // Filter out tool-invocation parts that have results
    const cleanedParts = uiMsg.parts.filter((part: any) => {
      if (part.type === "tool-invocation") {
        // Remove tool invocations that have results (completed calls)
        return !part.toolInvocation?.result;
      }
      return true;
    });

    return {
      ...msg,
      parts: cleanedParts,
    } as Message;
  });
}

export async function POST(request: Request) {
  const requestStartTime = Date.now();
  let requestSize = 0;

  try {
    const requestText = await request.text();
    requestSize = new Blob([requestText]).size;
    const json = JSON.parse(requestText);

    const session = await getSession();

    if (!session?.user.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const {
      id,
      message,
      chatModel,
      toolChoice,
      allowedAppDefaultToolkit,
      allowedMcpServers,
      thinking,
      mentions = [],
    } = chatApiSchemaRequestBodySchema.parse(json);

    // Initialize usage logging
    await chatUsageLogger.initializeLog({
      sessionId: id,
      messageId: message.id,
      userId: session.user.id,
      model: `${chatModel?.provider}/${chatModel?.model}`,
      requestSize,
    });

    const model = customModelProvider.getModel(chatModel);

    let thread = await chatRepository.selectThreadDetails(id);

    if (!thread) {
      logger.info(`create chat thread: ${id}`);
      const newThread = await chatRepository.insertThread({
        id,
        title: "",
        userId: session.user.id,
      });
      thread = await chatRepository.selectThreadDetails(newThread.id);
    }

    if (thread!.userId !== session.user.id) {
      return new Response("Forbidden", { status: 403 });
    }

    // if is false, it means the last message is manual tool execution
    const isLastMessageUserMessage = message.role == "user";

    const previousMessages = (thread?.messages ?? []).map(convertToMessage);

    const messages: Message[] = isLastMessageUserMessage
      ? appendClientMessage({
          messages: previousMessages,
          message,
        })
      : previousMessages;

    // Log user messages content
    await chatUsageLogger.logUserMessages(
      messages.map((msg) => ({
        role: msg.role,
        content:
          typeof msg.content === "string"
            ? msg.content
            : JSON.stringify(msg.content),
        parts: (msg as any).parts || [],
      })),
    );

    const inProgressToolStep = extractInProgressToolPart(messages.slice(-2));

    const supportToolCall = !isToolCallUnsupportedModel(model);

    const agentId = mentions.find((m) => m.type === "agent")?.agentId;

    const agent = await rememberAgentAction(agentId, session.user.id);

    if (agent?.instructions?.mentions) {
      mentions.push(...agent.instructions.mentions);
    }

    const isToolCallAllowed =
      supportToolCall && (toolChoice != "none" || mentions.length > 0);

    return createDataStreamResponse({
      execute: async (dataStream) => {
        const mcpClients = await mcpClientsManager.getClients();
        logger.info(`mcp-server count: ${mcpClients.length}`);

        // Tool loading with logging
        const _toolLoadStartTime = Date.now();

        const MCP_TOOLS = await safe()
          .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
          .map(() =>
            loadMcpTools({
              mentions,
              allowedMcpServers,
            }),
          )
          .orElse({});

        const WORKFLOW_TOOLS = await safe()
          .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
          .map(() =>
            loadWorkFlowTools({
              mentions,
              dataStream,
            }),
          )
          .orElse({});

        const APP_DEFAULT_TOOLS = await safe()
          .map(errorIf(() => !isToolCallAllowed && "Not allowed"))
          .map(() =>
            loadAppDefaultTools({
              mentions,
              allowedAppDefaultToolkit,
            }),
          )
          .orElse({});

        // Log tools loaded
        await chatUsageLogger.logToolsLoaded({
          mcpTools: MCP_TOOLS,
          workflowTools: WORKFLOW_TOOLS,
          appDefaultTools: APP_DEFAULT_TOOLS,
        });

        if (inProgressToolStep) {
          const toolExecutionStartTime = Date.now();

          const toolResult = await manualToolExecuteByLastMessage(
            inProgressToolStep,
            message,
            { ...MCP_TOOLS, ...WORKFLOW_TOOLS, ...APP_DEFAULT_TOOLS },
            request.signal,
          );

          // Log tool call result with arguments
          await chatUsageLogger.logToolCallResult({
            toolName: inProgressToolStep.toolInvocation.toolName,
            result: toolResult,
            executionTime: Date.now() - toolExecutionStartTime,
            args: inProgressToolStep.toolInvocation.args,
          });

          assignToolResult(inProgressToolStep, toolResult);
          dataStream.write(
            formatDataStreamPart("tool_result", {
              toolCallId: inProgressToolStep.toolInvocation.toolCallId,
              result: toolResult,
            }),
          );
        }

        const userPreferences = thread?.userPreferences || undefined;

        const mcpServerCustomizations = await safe()
          .map(() => {
            if (Object.keys(MCP_TOOLS ?? {}).length === 0)
              throw new Error("No tools found");
            return rememberMcpServerCustomizationsAction(session.user.id);
          })
          .map((v) => filterMcpServerCustomizations(MCP_TOOLS!, v))
          .orElse({});

        // Build system prompt components for logging
        const userSystemPrompt = buildUserSystemPrompt(
          session.user,
          userPreferences,
          agent,
        );
        const mcpCustomizationsPrompt =
          buildMcpServerCustomizationsSystemPrompt(mcpServerCustomizations);
        const _toolCallUnsupportedPrompt = !supportToolCall
          ? buildToolCallUnsupportedModelSystemPrompt
          : "";
        const thinkingPrompt =
          (!supportToolCall ||
            ["openai", "anthropic"].includes(chatModel?.provider ?? "")) &&
          thinking
            ? buildThinkingSystemPrompt(supportToolCall)
            : "";

        const systemPrompt = mergeSystemPrompt(
          userSystemPrompt,
          mcpCustomizationsPrompt,
          !supportToolCall && buildToolCallUnsupportedModelSystemPrompt,
          (!supportToolCall ||
            ["openai", "anthropic"].includes(chatModel?.provider ?? "")) &&
            thinking &&
            buildThinkingSystemPrompt(supportToolCall),
        );

        // Log system prompt breakdown with actual content
        await chatUsageLogger.logSystemPromptBreakdown({
          userSystemPrompt,
          mcpCustomizations: mcpCustomizationsPrompt,
          thinkingPrompt: thinkingPrompt,
          agentInstructions: agent?.instructions?.systemPrompt || "",
          fullPrompt: systemPrompt,
        });

        const vercelAITooles = safe({ ...MCP_TOOLS, ...WORKFLOW_TOOLS })
          .map((t) => {
            const bindingTools =
              toolChoice === "manual" ? excludeToolExecution(t) : t;
            return {
              ...bindingTools,
              ...APP_DEFAULT_TOOLS, // APP_DEFAULT_TOOLS Not Supported Manual
            };
          })
          .map((t) => {
            if (supportToolCall && thinking) {
              return {
                ...t,
                [SequentialThinkingToolName]: sequentialThinkingTool,
              };
            }
            return t;
          })
          .unwrap();

        const allowedMcpTools = Object.values(allowedMcpServers ?? {})
          .map((t) => t.tools)
          .flat();

        logger.info(
          `${agent ? `agent: ${agent.name}, ` : ""}tool mode: ${toolChoice}, mentions: ${mentions.length}, allowedMcpTools: ${allowedMcpTools.length} thinking: ${thinking}`,
        );
        logger.info(
          `binding tool count APP_DEFAULT: ${Object.keys(APP_DEFAULT_TOOLS ?? {}).length}, MCP: ${Object.keys(MCP_TOOLS ?? {}).length}, Workflow: ${Object.keys(WORKFLOW_TOOLS ?? {}).length}`,
        );
        logger.info(`model: ${chatModel?.provider}/${chatModel?.model}`);

        // Log initial request info
        chatUsageLogger.addStep({
          stepName: "request_init",
          timestamp: Date.now(),
          messagesCount: messages.length,
          additionalData: {
            isToolCallAllowed,
            toolChoice,
            thinking,
            mentionsCount: mentions.length,
            agentName: agent?.name,
            systemPromptTokenEstimate: Math.ceil(systemPrompt.length / 4),
          },
        });

        // Store for final conversation context logging
        let _finalAssistantMessage: any = null;
        let _finalUsage: any = null;

        // Clean tool results from message history before sending to LLM
        const cleanedMessages = cleanToolResultsFromMessages(messages);

        // Calculate detailed cleaning stats
        let removedToolResults = 0;
        let removedToolResultsSize = 0;
        const toolResultsFound: string[] = [];

        messages.forEach((msg, msgIndex) => {
          const uiMsg = msg as any;
          if (uiMsg.parts) {
            uiMsg.parts.forEach((part: any) => {
              if (
                part.type === "tool-invocation" &&
                part.toolInvocation?.result
              ) {
                removedToolResults++;
                const resultSize = JSON.stringify(
                  part.toolInvocation.result,
                ).length;
                removedToolResultsSize += resultSize;
                toolResultsFound.push(
                  `msg${msgIndex}:${part.toolInvocation.toolName || "unknown"}(${resultSize}chars)`,
                );
              }
            });
          }
        });

        chatUsageLogger.addStep({
          stepName: "cleaned_messages_analysis",
          timestamp: Date.now(),
          messagesCount: messages.length,
          additionalData: {
            originalMessagesCount: messages.length,
            cleanedMessagesCount: cleanedMessages.length,
            originalSize: JSON.stringify(messages).length,
            cleanedSize: JSON.stringify(cleanedMessages).length,
            tokensSaved:
              JSON.stringify(messages).length -
              JSON.stringify(cleanedMessages).length,
            removedToolResults,
            removedToolResultsSize,
            toolResultsFound,
            estimatedTokensSaved: Math.ceil(removedToolResultsSize / 4), // ~4 chars per token
          },
        });

        // Apply conversation limiting if needed
        let finalMessages = cleanedMessages;
        let _limitationResult: any = null;

        if (conversationLimiter.shouldLimit(cleanedMessages)) {
          const limitationStartTime = Date.now();

          try {
            const result =
              conversationLimiter.limitConversation(cleanedMessages);
            finalMessages = result.limitedMessages;
            _limitationResult = result;

            // Log limitation activity
            chatUsageLogger.addStep({
              stepName: "conversation_limitation",
              timestamp: Date.now(),
              additionalData: {
                originalMessageCount: result.originalCount,
                limitedMessageCount: result.limitedCount,
                messagesRemoved: result.tokensRemoved,
                tokensSaved: result.tokensSaved,
                limitationTime: Date.now() - limitationStartTime,
                maxTokensAllowed: conversationLimiter.getConfig().maxTokens,
                estimatedTokensBeforeLimiting: Math.ceil(
                  JSON.stringify(cleanedMessages).length / 4,
                ),
                estimatedTokensAfterLimiting: Math.ceil(
                  JSON.stringify(finalMessages).length / 4,
                ),
              },
            });

            console.log(
              `✂️ Conversation limited: ${result.originalCount} messages → ${result.limitedCount} messages (removed ${result.tokensRemoved} messages)`,
            );
            console.log(
              `💾 Tokens saved through limitation: ~${result.tokensSaved} tokens`,
            );
          } catch (error) {
            console.error(
              "Conversation limiting failed, using original messages:",
              error,
            );
            // Continue with cleaned messages if limiting fails
            finalMessages = cleanedMessages;
          }
        }

        const result = streamText({
          model,
          system: systemPrompt,
          messages: finalMessages,
          maxSteps: 10,
          toolCallStreaming: true,
          experimental_transform: smoothStream({ chunking: "word" }),
          maxRetries: 2,
          tools: vercelAITooles,
          toolChoice: "auto",
          abortSignal: request.signal,
          onFinish: async ({ response, usage }) => {
            // Log final LLM usage
            await chatUsageLogger.logLLMUsage({
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
              stepName: "final_llm_call",
            });

            _finalUsage = usage;

            const appendMessages = appendResponseMessages({
              messages: messages.slice(-1),
              responseMessages: response.messages,
            });
            if (isLastMessageUserMessage) {
              await chatRepository.upsertMessage({
                threadId: thread!.id,
                model: chatModel?.model ?? null,
                role: "user",
                parts: message.parts,
                attachments: message.experimental_attachments,
                id: message.id,
                annotations: appendAnnotations(message.annotations, {
                  usageTokens: usage.promptTokens,
                }),
              });
            }
            const assistantMessage = appendMessages.at(-1);
            _finalAssistantMessage = assistantMessage;

            if (assistantMessage) {
              // Extract response content for logging
              const responseContent =
                assistantMessage.parts
                  ?.filter((part: any) => part.type === "text")
                  ?.map((part: any) => part.text)
                  ?.join(" ") || "";

              // Extract tool calls for logging
              const toolCalls =
                assistantMessage.parts
                  ?.filter((part: any) => part.type === "tool-invocation")
                  ?.map((part: any) => ({
                    name: part.toolInvocation.toolName,
                    args: part.toolInvocation.args,
                    result: part.toolInvocation.result,
                  })) || [];

              // Log final response content
              await chatUsageLogger.logFinalResponse({
                content: responseContent,
                toolCalls,
              });

              // Log complete conversation context
              await chatUsageLogger.logFullConversationContext({
                systemPrompt,
                messages: finalMessages.map((msg) => ({
                  role: msg.role,
                  content:
                    typeof msg.content === "string"
                      ? msg.content
                      : JSON.stringify(msg.content),
                  parts: (msg as any).parts || [],
                })),
                finalResponse: responseContent,
                actualTokens: {
                  promptTokens: usage.promptTokens,
                  completionTokens: usage.completionTokens,
                  totalTokens: usage.totalTokens,
                },
              });

              const annotations = appendAnnotations(
                assistantMessage.annotations,
                {
                  usageTokens: usage.completionTokens,
                  toolChoice,
                },
              );
              dataStream.writeMessageAnnotation(annotations.at(-1)!);
              chatRepository.upsertMessage({
                model: chatModel?.model ?? null,
                threadId: thread!.id,
                role: assistantMessage.role,
                id: assistantMessage.id,
                parts: (assistantMessage.parts as UIMessage["parts"]).map(
                  (v) => {
                    if (
                      v.type == "tool-invocation" &&
                      v.toolInvocation.state == "result" &&
                      isVercelAIWorkflowTool(v.toolInvocation.result)
                    ) {
                      return {
                        ...v,
                        toolInvocation: {
                          ...v.toolInvocation,
                          result: {
                            ...v.toolInvocation.result,
                            history: v.toolInvocation.result.history.map(
                              (h) => {
                                return {
                                  ...h,
                                  result: undefined,
                                };
                              },
                            ),
                          },
                        },
                      };
                    }
                    if (
                      v.type == "tool-invocation" &&
                      v.toolInvocation.state == "result" &&
                      v.toolInvocation.toolName == SequentialThinkingToolName
                    ) {
                      return {
                        ...v,
                        toolInvocation: {
                          ...v.toolInvocation,
                          args: {},
                        },
                      };
                    }
                    return v;
                  },
                ),
                attachments: assistantMessage.experimental_attachments,
                annotations,
              });
            }
            if (agent) {
              await agentRepository.updateAgent(agent.id, session.user.id, {
                updatedAt: new Date(),
              } as any);
            }

            // Finalize logging
            const responseSize = assistantMessage
              ? new Blob([JSON.stringify(assistantMessage)]).size
              : 0;
            await chatUsageLogger.finalizeAndSave(responseSize);
          },
        });
        result.consumeStream();
        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
        result.usage.then((usage) => {
          logger.debug(
            `usage input: ${usage.promptTokens}, usage output: ${usage.completionTokens}, usage total: ${usage.totalTokens}`,
          );

          // Log enhanced usage info
          logger.info(
            `USAGE SUMMARY - Session: ${id}, Message: ${message.id}, ` +
              `Total: ${usage.totalTokens}, Prompt: ${usage.promptTokens}, ` +
              `Completion: ${usage.completionTokens}, ` +
              `Duration: ${Date.now() - requestStartTime}ms, ` +
              `Request Size: ${Math.round(requestSize / 1024)}KB`,
          );
        });
      },
      onError: handleError,
    });
  } catch (error: any) {
    logger.error(error);

    // Try to finalize logging even on error
    try {
      await chatUsageLogger.finalizeAndSave();
    } catch (logError) {
      logger.error("Failed to finalize usage logging on error:", logError);
    }

    return new Response(error.message, { status: 500 });
  }
}
