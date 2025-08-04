# Conversation Summarization

This system automatically summarizes conversation history to prevent token overflow and reduce API costs.

## How It Works

### Sliding Window Approach
1. **Monitor Token Count**: Tracks estimated tokens in conversation history
2. **Threshold Detection**: When conversation exceeds configured limit, summarization triggers
3. **Smart Preservation**: Keeps recent messages intact for context continuity
4. **Efficient Summarization**: Uses GPT 3.5 turbo to create concise summaries

### Process Flow
```
Original Conversation (15 messages, 9,000 tokens)
     ↓
Tool Result Cleaning (removes large data)
     ↓
Summarization Check (9,000 > 8,000 threshold)
     ↓
Split Messages: [9 old messages] + [6 recent messages]
     ↓
GPT 3.5 Turbo Summarization (9 messages → summary)
     ↓
Final: [Summary] + [6 recent messages] (3,000 tokens)
```

## Configuration

### Environment Variables

```bash
# Maximum tokens before summarization triggers
CONVERSATION_MAX_TOKENS=8000

# Number of recent messages to preserve
CONVERSATION_KEEP_RECENT=6

# Model used for summarization (cost-optimized)
CONVERSATION_SUMMARY_MODEL=gpt-3.5-turbo
```

### Default Settings
- **Max Tokens**: 8,000 (when to start summarizing)
- **Keep Recent**: 6 messages (always preserved)
- **Summary Model**: GPT 3.5 turbo (fast, cheap, effective)

## Benefits

### Token Savings
- **Before**: Long conversations → 10,000+ tokens
- **After**: Summarized conversations → 3,000-4,000 tokens
- **Savings**: 60-70% token reduction

### Cost Efficiency
- Uses cheap GPT 3.5 turbo for summarization
- Reduces expensive main model token usage
- Maintains conversation quality

### Performance
- Faster responses (less context to process)
- Prevents rate limiting
- Preserves recent context for continuity

## Monitoring

### Console Output
```
📊 Token Analysis - session_003 | Model: anthropic/claude-4-sonnet
   System Prompt: 200 tokens
   Messages Content: 2,800 tokens  
   Tools & Overhead: 400 tokens
   Response: 150 tokens
   Total: 3,550 tokens
📝 Summarization: 9 messages → summary (saved ~4,200 tokens)
```

### Log Data
- Original message count
- Summarized message count  
- Tokens saved
- Summarization execution time
- Summary quality metrics

## Best Practices

### When to Use
- ✅ Long university guidance conversations
- ✅ Multi-topic discussions
- ✅ Extended question-answer sessions
- ✅ High-frequency users

### Configuration Tips
- **Lower threshold** (6,000) for cost-sensitive usage
- **Higher threshold** (10,000) for quality-sensitive usage
- **More recent messages** (8-10) for complex conversations
- **Fewer recent messages** (4-6) for simple conversations

### Quality Assurance
- Summaries preserve key user context
- Important decisions and preferences maintained
- University guidance context retained
- Tool usage patterns remembered

## Troubleshooting

### Common Issues
1. **Summarization Fails**: Falls back to original messages
2. **Context Loss**: Increase `CONVERSATION_KEEP_RECENT`
3. **Still High Tokens**: Decrease `CONVERSATION_MAX_TOKENS`
4. **Poor Summaries**: Check OpenAI API connectivity

### Monitoring
- Check console logs for summarization activity
- Review session logs for token savings
- Monitor conversation quality after summarization 