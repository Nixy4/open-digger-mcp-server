# MCP Server Installation Guide
## Prerequisites

Before installation, ensure you have:
- Node.js installed on your system
- The MCP server files located in `./mcp-server/` directory
- Built server files available in `./mcp-server/dist/index.js`

---

## Installation

### Cursor

To add this server to Cursor IDE:

1. Navigate to `Cursor Settings` > `MCP`
2. Click `+ Add new Global MCP Server`
3. Add the following configuration to your global `.cursor/mcp.json` file:

```json
{
  "mcpServers": {
    "open-digger-mcp": {
      "command": "node",
      "args": ["./mcp-server/dist/index.js"],
      "cwd": "./mcp-server/",
      "env": {
        "CACHE_TTL_SECONDS": "300",
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Note**: You can also add this to your project-specific Cursor configuration (supported in Cursor 0.46+).

Refer to the [Cursor documentation](https://docs.cursor.com/context/model-context-protocol) for additional details.

### Windsurf

To set up MCP with Cascade:

1. Open Windsurf and navigate to `Settings` > `Advanced Settings` or use the Command Palette > `Open Windsurf Settings Page`
2. Scroll to the Cascade section to add a new server, view existing servers, or access the raw JSON config file at `mcp_config.json`
3. Click "Add custom server +" to include the open-digger MCP server directly in `mcp_config.json`:

```json
{
  "mcpServers": {
    "open-digger-mcp": {
      "command": "node",
      "args": ["./mcp-server/dist/index.js"],
      "cwd": "./mcp-server/",
      "env": {
        "CACHE_TTL_SECONDS": "300",
        "NODE_ENV": "production"
      }
    }
  }
}
```

Refer to the [Windsurf documentation](https://docs.codeium.com/windsurf/mcp) for more information.

### VS Code

To install the open-digger MCP server in VS Code, you can use the VS Code CLI:

```bash
# For VS Code
code --add-mcp '{"name":"open-digger-mcp","command":"node","args":["./mcp-server/dist/index.js"],"cwd":"./mcp-server/","env":{"CACHE_TTL_SECONDS":"300","NODE_ENV":"production"}}'
```

```bash
# For VS Code Insiders
code-insiders --add-mcp '{"name":"open-digger-mcp","command":"node","args":["./mcp-server/dist/index.js"],"cwd":"./mcp-server/","env":{"CACHE_TTL_SECONDS":"300","NODE_ENV":"production"}}'
```

Alternatively, you can manually add the configuration to your MCP settings file through the VS Code interface.

After installation, the open-digger MCP server will be available for use with your GitHub Copilot agent in VS Code.

### Claude Desktop

Add the following configuration to your `claude_desktop_config.json` file:

```json
{
  "mcpServers": {
    "open-digger-mcp": {
      "command": "node",
      "args": ["./mcp-server/dist/index.js"],
      "cwd": "./mcp-server/",
      "env": {
        "CACHE_TTL_SECONDS": "300",
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Configuration file locations:**
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Refer to the [Claude Desktop documentation](https://modelcontextprotocol.io/quickstart/user) for more details.

## Configuration Options

The MCP server supports the following environment variables:

- `CACHE_TTL_SECONDS`: Cache time-to-live in seconds (default: 300)
- `NODE_ENV`: Node environment setting (production/development)

## Troubleshooting

1. **Server not starting**: Ensure the built files exist in `./mcp-server/dist/index.js`
2. **Path issues**: Verify that the `cwd` path is correct relative to your project root
3. **Node.js not found**: Make sure Node.js is installed and available in your system PATH
4. **Permission issues**: Check that the MCP server files have appropriate read/execute permissions

## Verification

After installation, you should see the open-digger MCP server listed in your IDE's MCP server configuration and it should be available for use with AI assistants that support MCP.