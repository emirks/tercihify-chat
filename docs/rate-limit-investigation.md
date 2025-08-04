# Rate Limit Investigation System

This system helps identify and resolve rate limiting issues in your chat application by providing detailed logging and analytics of token usage, prompt sizes, and tool call results.

## Overview

Rate limits in your chat application are likely caused by:

1. **Large System Prompts** - Your university guidance prompts are quite extensive
2. **Large MCP Tool Results** - YÖK Atlas and other MCP servers can return massive datasets
3. **Multiple Tool Calls** - Sequential tool calls compound token usage
4. **Tool Result Context** - Large tool results get passed back to the LLM as context

## Logging System

### What Gets Logged

The new logging system tracks:

- **Request/Response Sizes** - Initial request and final response data volumes
- **System Prompt Breakdown** - Size analysis of each prompt component
- **Tool Loading Stats** - Number and types of tools loaded per request
- **Tool Call Results** - Individual tool execution times and result sizes
- **Token Usage Per Step** - Detailed tracking of prompt vs completion tokens
- **Session Analytics** - Aggregated data across multiple messages

### Log File Structure

```
logs/chat-usage/
├── {session-id-1}/
│   ├── 2024-01-15_14-30-45_{message-id-1}.json
│   ├── 2024-01-15_14-32-12_{message-id-2}.json
│   └── session_summary.json
├── {session-id-2}/
│   ├── 2024-01-15_15-15-23_{message-id-1}.json
│   └── session_summary.json
```

## Using the Analytics Dashboard

### Access the Dashboard

1. **HTML Interface**: `POST /api/admin/usage-analytics`
   - Provides a visual dashboard with high-usage sessions
   - Color-coded warnings for sessions approaching limits

2. **JSON API**: `GET /api/admin/usage-analytics`
   - `?action=high-usage&limit=20` - Get top usage sessions
   - `?action=session-details&sessionId=xxx` - Get detailed session data

### Reading the Dashboard

**Color Codes:**
- 🔴 **Red (High Usage)**: >50k tokens - Likely causing rate limits
- 🟡 **Yellow (Warning)**: >20k tokens - Approaching limits  
- ⚪ **Normal**: <20k tokens

**Key Metrics:**
- **Peak Usage**: Highest token count in a single message
- **Total Tokens**: Cumulative usage across all messages
- **Avg per Message**: Helps identify consistent vs. spike issues
- **Tool Usage**: Which tools are being called most frequently

## Common Rate Limit Causes & Solutions

### 1. Large System Prompts

**Problem**: Your university guidance system prompt is ~2000+ tokens
**Detection**: Check `system_prompt_analysis` step in logs
**Solutions**:
- Split system prompt into smaller, context-specific sections
- Use dynamic prompt loading based on user intent
- Cache frequently used prompt components

### 2. Large MCP Tool Results

**Problem**: YÖK Atlas queries returning massive datasets
**Detection**: Look for MCP tool warnings in console: `⚠️ Large MCP result detected`
**Solutions**:
- Implement result filtering at the MCP server level
- Add pagination to large data queries
- Use summary/truncation for large datasets before passing to LLM

### 3. Tool Result Accumulation

**Problem**: Multiple tool calls create massive context
**Detection**: High `completion_tokens` relative to `prompt_tokens`
**Solutions**:
- Clear tool result context after processing
- Summarize tool results instead of passing raw data
- Limit number of sequential tool calls

### 4. Agent Instructions Bloat

**Problem**: Custom agent instructions adding significant token overhead
**Detection**: High `agentInstructions` size in prompt breakdown
**Solutions**:
- Use more concise agent instructions
- Dynamic instruction loading based on task type
- Template-based instructions instead of full text

## Immediate Actions to Take

### 1. Start Monitoring

1. Deploy the logging system
2. Let it run for a few hours during normal usage
3. Check the analytics dashboard

### 2. Identify Problem Areas

```bash
# Check recent high-usage sessions
curl -X GET "/api/admin/usage-analytics?action=high-usage&limit=5"

# Get details for a specific problematic session
curl -X GET "/api/admin/usage-analytics?action=session-details&sessionId=SESSION_ID"
```

### 3. Quick Wins

1. **Reduce System Prompt Size**:
   ```typescript
   // Instead of loading all guidance text:
   const systemPrompt = buildUserSystemPrompt(...);
   
   // Load context-specific guidance:
   const systemPrompt = buildContextualSystemPrompt(userIntent, ...);
   ```

2. **Limit MCP Result Sizes**:
   ```typescript
   // Add size limits to MCP calls
   if (resultSize > 50000) { // 50KB limit
     result = truncateResult(result, 50000);
   }
   ```

3. **Tool Result Summarization**:
   ```typescript
   // Summarize large tool results before passing to LLM
   if (toolResult.length > 10000) {
     toolResult = await summarizeResult(toolResult);
   }
   ```

## Advanced Investigation

### Session Deep Dive

For problematic sessions, examine:

1. **Step-by-step Token Usage** - Identify which steps consume most tokens
2. **Tool Call Patterns** - Look for redundant or inefficient tool usage
3. **Prompt Component Analysis** - Which parts of the system prompt are largest
4. **Tool Result Sizes** - Individual tool calls that return massive data

### Code Examples

**Find Sessions with Large Tool Results**:
```javascript
// In browser console on analytics page
const sessions = await fetch('/api/admin/usage-analytics?action=high-usage&limit=50')
  .then(r => r.json());

const sessionsWithLargeTools = sessions.data.filter(s => 
  Object.keys(s.mostUsedTools).some(tool => tool.includes('mcp_'))
);
```

**Analyze System Prompt Components**:
```typescript
// Check logs for system_prompt_analysis steps
const logs = JSON.parse(fs.readFileSync('logs/chat-usage/session/message.json'));
const promptBreakdown = logs.steps.find(s => s.stepName === 'system_prompt_analysis');
console.log('Prompt breakdown:', promptBreakdown.promptSizeBreakdown);
```

## Monitoring in Production

### Set Up Alerts

1. **High Token Usage Alert**: >30k tokens per message
2. **Large Tool Result Alert**: >100KB tool result
3. **Rate Limit Error Alert**: When API returns rate limit errors

### Regular Maintenance

1. **Weekly Review**: Check top 10 highest usage sessions
2. **Monthly Analysis**: Trend analysis of average token usage
3. **Tool Performance Review**: Identify consistently expensive tools

### Performance Optimization

1. **Prompt Optimization**: Regular review and reduction of system prompts
2. **Tool Result Caching**: Cache expensive tool calls when possible
3. **Context Management**: Implement intelligent context truncation

## Example Investigation Workflow

1. **User Reports Rate Limiting**
2. **Check Analytics Dashboard** - Look for recent high-usage sessions
3. **Identify Problem Session** - Find session with >50k token usage
4. **Examine Session Details** - Look at step-by-step breakdown
5. **Find Root Cause** - Large tool result? Massive system prompt?
6. **Implement Fix** - Add size limits, prompt optimization, etc.
7. **Monitor Results** - Verify fix reduces token usage

This system gives you complete visibility into your token usage patterns and will help you quickly identify and resolve rate limiting issues. 