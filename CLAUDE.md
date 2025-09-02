# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Core Commands

### Development

- `pnpm run build` - Compile TypeScript to JavaScript in dist/ directory
- `pnpm start` - Run the compiled MCP server
- `pnpm install` - Install dependencies

### MCP Server Installation

- `pnpm run install-server` - Install to all MCP clients (Claude Desktop, Cursor, Claude Code, Gemini, MCP)
- `pnpm run install-desktop` - Install to Claude Desktop only
- `pnpm run install-cursor` - Install to Cursor only
- `pnpm run install-code` - Install to Claude Code only
- `pnpm run install-mcp` - Install to .mcp.json only

Installation scripts automatically build the project and update the respective configuration files.

## Architecture

This is an MCP (Model Context Protocol) server for video generation built with:

- **Core Framework**: @modelcontextprotocol/sdk for MCP server implementation
- **Runtime**: Node.js with ES modules (`"type": "module"`)
- **Language**: TypeScript with ES2022 target
- **Schema Validation**: Zod for parameter validation
- **Transport**: StdioServerTransport for client communication

### Project Structure

```
src/
├── index.ts           # Main MCP server implementation
scripts/
├── update-config.js   # Multi-client configuration installer
dist/                  # Compiled JavaScript output
```
