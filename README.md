# OpenDigger MCP Server

A Model Context Protocol (MCP) server for OpenDigger, enabling LLMs to interact with repository metrics and analytics.

> [!NOTE]  
> The README.md is still under development. I'll also add an INSTRUCTION_GUIDE.md later which provides detailed usage instructions and examples.


## Quick Start

```bash
# Setup
git clone https://github.com/X-lab2017/open-digger-mcp-server.git
cd open-digger-mcp-server && cd mcp-server
npm install
npm run build

# Configure Cursor (update path in .cursor/mcp.json)
# Start server
npm start
```

## Features

### Tools (6)
1. **get_open_digger_metric** - Single metric fetching
2. **get_open_digger_metrics_batch** - Batch operations  
3. **compare_repositories** - Multi-repo analysis
4. **analyze_trends** - Growth trend analysis
5. **get_ecosystem_insights** - Ecosystem analytics
6. **server_health** - System diagnostics

### Prompts (3)
1. **repo_health_analysis** - Comprehensive repo health reports
2. **repo_comparison** - Competitive repository analysis  
3. **developer_insights** - Developer activity analysis

### Metrics
Core: `openrank`, `stars`, `forks`, `contributors`, `participants`, `issues_new`, `issues_closed`, `pull_requests`, `commits`, `activity`

Extended: `technical_fork`, `bus_factor`, `releases`, `inactive_contributors`, `maintainer_count`, `community_activity`

## Usage Examples

### Repository Comparison
```
Compare microsoft/vscode and facebook/react using the compare_repositories tool
```

### Health Analysis  
```
Generate a health report for microsoft/vscode using the repo_health_analysis prompt
```

### Trend Analysis
```
Analyze the growth trends for contributors in microsoft/vscode over 2 years
```

## Configuration

### Environment Variables (.env)
```bash
CACHE_TTL_SECONDS=300
# SSE_PORT=3001  # Optional
```

### Cursor MCP (.cursor/mcp.json)
```json
{
  "mcpServers": {
    "open-digger": {
      "command": "node",
      "args": ["/full/path/to/dist/index.js"],
      "cwd": "/full/path/to/project",
      "env": {
        "CACHE_TTL_SECONDS": "300"
      }
    }
  }
}
```


## Development

```bash
npm run watch           # Development mode
npm run build           # Compile TypeScript
npm run clean           # Clean build files
npm run sse:test        # Test SSE server
```



## License
Apache-2.0 License