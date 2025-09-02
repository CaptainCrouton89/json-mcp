#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Create the JSON MCP server
const server = new McpServer({
  name: "json-tools",
  version: "1.0.0",
});

// Utility functions
function safeParseJSON(content: string, filePath: string): any {
  try {
    return JSON.parse(content);
  } catch (error: any) {
    throw new Error(`Invalid JSON in file ${filePath}: ${error.message}`);
  }
}

function readJSONFile(filePath: string): any {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }
  
  const content = readFileSync(absolutePath, 'utf8');
  return safeParseJSON(content, absolutePath);
}

function getValueByPath(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current) && !isNaN(Number(key))) {
      return current[Number(key)];
    }
    return current[key];
  }, obj);
}

function analyzeJSONStructure(obj: any, maxDepth: number = 3, currentDepth: number = 0): any {
  if (currentDepth > maxDepth) return "[...depth limit reached...]";
  
  if (obj === null) return null;
  if (typeof obj !== 'object') return typeof obj;
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) return [];
    const sample = obj.slice(0, 3).map(item => analyzeJSONStructure(item, maxDepth, currentDepth + 1));
    return obj.length > 3 ? [...sample, `[...${obj.length - 3} more items]`] : sample;
  }
  
  const result: any = {};
  const keys = Object.keys(obj);
  const sampleKeys = keys.slice(0, 5);
  
  for (const key of sampleKeys) {
    result[key] = analyzeJSONStructure(obj[key], maxDepth, currentDepth + 1);
  }
  
  if (keys.length > 5) {
    result[`[...${keys.length - 5} more keys]`] = "...";
  }
  
  return result;
}

function filterObject(obj: any, condition: string): any {
  try {
    // For arrays: item, index are available
    // For objects: value, key, index are available
    const conditionFn = new Function('item', 'key', 'index', 'value', `return ${condition}`);
    
    if (Array.isArray(obj)) {
      return obj.filter((item, index) => conditionFn(item, undefined, index, item));
    } else if (typeof obj === 'object' && obj !== null) {
      const result: any = {};
      Object.entries(obj).forEach(([key, value], index) => {
        if (conditionFn(value, key, index, value)) {
          result[key] = value;
        }
      });
      return result;
    }
    return obj;
  } catch (error: any) {
    throw new Error(`Invalid filter condition: ${error.message}`);
  }
}

// Tool 1: JSON Read - Read and analyze JSON files with flexible output
server.tool(
  "json_read",
  "Read and analyze JSON files with flexible output options",
  {
    file_path: z.string().describe("Path to the JSON file"),
    path: z.string().optional().describe("Dot notation to specific location"),
    max_depth: z.number().optional().describe("Limit traversal depth"),
    sample_arrays: z.number().optional().describe("Show only first N array items"),
    keys_only: z.boolean().optional().describe("Return only the key structure"),
    include_types: z.boolean().optional().describe("Add type information"),
    include_stats: z.boolean().optional().describe("Add file size and structure statistics"),
  },
  async ({ file_path, path, max_depth, sample_arrays, keys_only, include_types, include_stats }) => {
    try {
      const data = readJSONFile(file_path);
      const target = path ? getValueByPath(data, path) : data;
      
      let result: any;
      
      if (keys_only) {
        result = analyzeJSONStructure(target, max_depth || 3);
      } else if (sample_arrays !== undefined) {
        result = JSON.parse(JSON.stringify(target, (key, value) => {
          if (Array.isArray(value) && sample_arrays) {
            return value.slice(0, sample_arrays);
          }
          return value;
        }));
      } else {
        result = target;
      }
      
      // Build output with optional metadata
      let output: any = result;
      
      if (include_types || include_stats) {
        output = {
          data: result
        };
        
        if (include_types) {
          output.type = typeof target;
          output.isArray = Array.isArray(target);
        }
        
        if (include_stats) {
          const fileContent = readFileSync(resolve(file_path), 'utf8');
          const fileSize = (fileContent.length / 1024).toFixed(2);
          const nodeCount = JSON.stringify(data).length;
          
          output.stats = {
            fileSizeKB: fileSize,
            totalNodes: nodeCount,
            rootType: Array.isArray(data) ? 'array' : typeof data
          };
          
          if (Array.isArray(target)) {
            output.stats.arrayLength = target.length;
            output.stats.elementTypes = [...new Set(target.map(item => typeof item))];
          } else if (typeof target === 'object' && target !== null) {
            const keys = Object.keys(target);
            output.stats.keyCount = keys.length;
            output.stats.topKeys = keys.slice(0, 10);
          }
        }
      }
      
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

// Tool 2: JSON Extract - Extract specific data using various methods
server.tool(
  "json_extract",
  "Extract specific data using paths, filters, patterns, or slices",
  {
    file_path: z.string().describe("Path to the JSON file"),
    path: z.string().optional().describe("Dot notation path to target"),
    filter: z.string().optional().describe("JS condition to filter results (e.g., 'item.age > 18')"),
    pattern: z.string().optional().describe("Regex pattern to search for"),
    search_type: z.enum(["key", "value", "both"]).optional().describe("What to search when using pattern"),
    start: z.number().optional().describe("Array slice start index"),
    end: z.number().optional().describe("Array slice end index"),
    keys: z.array(z.string()).optional().describe("Specific object keys to extract"),
    default_value: z.any().optional().describe("Fallback if path not found"),
  },
  async ({ file_path, path, filter, pattern, search_type, start, end, keys, default_value }) => {
    try {
      const data = readJSONFile(file_path);
      let target = path ? getValueByPath(data, path) : data;
      
      // If path was specified but not found, return default value
      if (path && target === undefined) {
        const output = default_value !== undefined ? default_value : null;
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({
              result: output,
              message: `Path not found: ${path}, returning default value`
            }, null, 2) 
          }],
        };
      }
      
      // Apply filter if specified
      if (filter) {
        target = filterObject(target, filter);
      }
      
      // Apply pattern search if specified
      if (pattern) {
        const results: any[] = [];
        const flags = 'gi'; // Case-insensitive by default
        const regex = new RegExp(pattern, flags);
        const searchFor = search_type || 'both';
        
        function searchObject(obj: any, currentPath: string = ""): void {
          if (Array.isArray(obj)) {
            obj.forEach((item, index) => {
              searchObject(item, `${currentPath}[${index}]`);
            });
          } else if (typeof obj === 'object' && obj !== null) {
            Object.entries(obj).forEach(([key, value]) => {
              const newPath = currentPath ? `${currentPath}.${key}` : key;
              
              if ((searchFor === 'key' || searchFor === 'both') && regex.test(key)) {
                results.push({ type: 'key', path: newPath, key, value });
              }
              
              if ((searchFor === 'value' || searchFor === 'both')) {
                if (value === null && pattern === 'null') {
                  results.push({ type: 'value', path: newPath, key, value });
                } else if (typeof value === 'string' && regex.test(value)) {
                  results.push({ type: 'value', path: newPath, key, value });
                } else if (typeof value === 'number' && regex.test(value.toString())) {
                  results.push({ type: 'value', path: newPath, key, value });
                } else if (typeof value === 'boolean' && regex.test(value.toString())) {
                  results.push({ type: 'value', path: newPath, key, value });
                }
              }
              
              searchObject(value, newPath);
            });
          }
        }
        
        searchObject(target);
        target = results;
      }
      
      // Apply slicing if specified
      if ((start !== undefined || end !== undefined) && Array.isArray(target)) {
        const sliceStart = start || 0;
        const sliceEnd = end || target.length;
        target = target.slice(sliceStart, sliceEnd);
      }
      
      // Extract specific keys if specified
      if (keys && typeof target === 'object' && target !== null && !Array.isArray(target)) {
        const extracted: any = {};
        keys.forEach(key => {
          if (key in target) {
            extracted[key] = target[key];
          }
        });
        target = extracted;
      }
      
      return {
        content: [{ type: "text", text: JSON.stringify(target, null, 2) }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

// Start the server
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("JSON Tools MCP Server running...");
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

main().catch(console.error);