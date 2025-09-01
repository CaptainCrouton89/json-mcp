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
    const conditionFn = new Function('item', 'key', 'index', `return ${condition}`);
    
    if (Array.isArray(obj)) {
      return obj.filter((item, index) => conditionFn(item, index, index));
    } else if (typeof obj === 'object' && obj !== null) {
      const result: any = {};
      Object.entries(obj).forEach(([key, value], index) => {
        if (conditionFn(value, key, index)) {
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

// Tool 1: JSON Read - Basic file reading with optional filtering
server.tool(
  "json_read",
  "Read JSON files with optional depth limits and sampling. Use for exploring large JSON structures or getting an overview.",
  {
    file_path: z.string().describe("Path to the JSON file"),
    max_depth: z.number().optional().describe("Maximum depth to traverse (default: unlimited)"),
    keys_only: z.boolean().optional().describe("Return only keys at each level"),
    include_types: z.boolean().optional().describe("Include type information"),
    sample_arrays: z.number().optional().describe("For arrays, show only first N items (default: all)"),
  },
  async ({ file_path, max_depth, keys_only, include_types, sample_arrays }) => {
    try {
      const data = readJSONFile(file_path);
      
      let result: any;
      
      if (keys_only) {
        result = analyzeJSONStructure(data, max_depth || 2);
      } else if (max_depth !== undefined || sample_arrays !== undefined) {
        result = JSON.parse(JSON.stringify(data, (key, value) => {
          if (Array.isArray(value) && sample_arrays) {
            return value.slice(0, sample_arrays);
          }
          return value;
        }));
      } else {
        result = data;
      }
      
      const output = include_types 
        ? { data: result, type: typeof data, isArray: Array.isArray(data) }
        : result;
      
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

// Tool 2: JSON Stats - Analyze structure and size
server.tool(
  "json_stats",
  "Get file size, structure analysis, and depth statistics. Use to understand JSON complexity before processing.",
  {
    file_path: z.string().describe("Path to the JSON file"),
    include_sample: z.boolean().optional().describe("Include sample data structure"),
  },
  async ({ file_path, include_sample }) => {
    try {
      const data = readJSONFile(file_path);
      
      function getStats(obj: any, path: string = "root"): any {
        if (obj === null || obj === undefined) {
          return { type: typeof obj, path, size: 0 };
        }
        
        if (typeof obj !== 'object') {
          return { type: typeof obj, path, size: 1 };
        }
        
        if (Array.isArray(obj)) {
          return {
            type: 'array',
            path,
            length: obj.length,
            size: obj.length,
            elementTypes: [...new Set(obj.map(item => typeof item))],
            sample: include_sample ? obj.slice(0, 2) : undefined
          };
        }
        
        const keys = Object.keys(obj);
        return {
          type: 'object',
          path,
          keyCount: keys.length,
          size: keys.length,
          keys: keys.slice(0, 10),
          keyTypes: keys.reduce((acc, key) => {
            acc[key] = typeof obj[key];
            return acc;
          }, {} as Record<string, string>),
          sample: include_sample ? analyzeJSONStructure(obj, 1) : undefined
        };
      }
      
      const stats = getStats(data);
      const fileContent = readFileSync(resolve(file_path), 'utf8');
      
      const fileSize = (fileContent.length / 1024).toFixed(2);
      const nodeCount = JSON.stringify(data).length;
      
      let markdown = `# JSON File Statistics\n\n`;
      markdown += `**File Size:** ${fileSize} KB\n`;
      markdown += `**Total Nodes:** ${nodeCount.toLocaleString()}\n`;
      markdown += `**Type:** ${stats.type}\n`;
      
      if (stats.type === 'array') {
        markdown += `**Length:** ${stats.length}\n`;
        markdown += `**Element Types:** ${stats.elementTypes.join(', ')}\n`;
      } else if (stats.type === 'object') {
        markdown += `**Key Count:** ${stats.keyCount}\n`;
        markdown += `**Top Keys:** ${stats.keys.join(', ')}\n`;
      }
      
      if (include_sample && stats.sample) {
        markdown += `\n## Sample Structure\n\`\`\`json\n${JSON.stringify(stats.sample, null, 2)}\n\`\`\`\n`;
      }
      
      return {
        content: [{ type: "text", text: markdown }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

// Tool 3: JSON Query - JSONPath-like queries
server.tool(
  "json_query",
  "Extract values using dot notation paths like 'users.0.name'. Use for precise data extraction.",
  {
    file_path: z.string().describe("Path to the JSON file"),
    query_path: z.string().describe("Dot notation path to query (e.g., 'users.0.name')"),
    default_value: z.any().optional().describe("Default value if path not found"),
  },
  async ({ file_path, query_path, default_value }) => {
    try {
      const data = readJSONFile(file_path);
      const result = getValueByPath(data, query_path);
      
      const output = result !== undefined ? result : (default_value !== undefined ? default_value : null);
      
      return {
        content: [{ 
          type: "text", 
          text: result !== undefined 
            ? `✓ Found at path: ${query_path}\n\nValue:\n${JSON.stringify(output, null, 2)}`
            : `✗ Path not found: ${query_path}\n\nDefault: ${JSON.stringify(output, null, 2)}`
        }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

// Tool 4: JSON Slice - Extract specific ranges or keys
server.tool(
  "json_slice",
  "Extract array ranges or specific object keys. Use to get subsets of data.",
  {
    file_path: z.string().describe("Path to the JSON file"),
    path: z.string().optional().describe("Dot notation path to the target (default: root)"),
    start: z.number().optional().describe("Start index for arrays"),
    end: z.number().optional().describe("End index for arrays"),
    keys: z.array(z.string()).optional().describe("Specific keys to extract from objects"),
  },
  async ({ file_path, path, start, end, keys }) => {
    try {
      const data = readJSONFile(file_path);
      let target = path ? getValueByPath(data, path) : data;
      
      if (Array.isArray(target)) {
        const sliceStart = start || 0;
        const sliceEnd = end || target.length;
        target = target.slice(sliceStart, sliceEnd);
      } else if (typeof target === 'object' && target !== null && keys) {
        const result: any = {};
        keys.forEach(key => {
          if (key in target) {
            result[key] = target[key];
          }
        });
        target = result;
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

// Tool 5: JSON Filter - Filter arrays or objects by conditions
server.tool(
  "json_filter",
  "Filter arrays/objects with JS conditions like 'item.age > 18'. Use for conditional data extraction.",
  {
    file_path: z.string().describe("Path to the JSON file"),
    path: z.string().optional().describe("Dot notation path to the target array/object"),
    condition: z.string().describe("JavaScript condition (e.g., 'item.age > 18', 'key.includes(\"test\")')"),
  },
  async ({ file_path, path, condition }) => {
    try {
      const data = readJSONFile(file_path);
      const target = path ? getValueByPath(data, path) : data;
      
      const filtered = filterObject(target, condition);
      
      return {
        content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

// Tool 6: JSON Search - Search for keys/values matching patterns
server.tool(
  "json_search",
  "Find keys or values matching regex patterns. Use to locate specific data across the entire structure.",
  {
    file_path: z.string().describe("Path to the JSON file"),
    search_type: z.enum(["key", "value", "both"]).describe("What to search for"),
    pattern: z.string().describe("Search pattern (supports regex)"),
    case_sensitive: z.boolean().optional().describe("Case sensitive search (default: false)"),
    max_results: z.number().optional().describe("Maximum number of results (default: 100)"),
  },
  async ({ file_path, search_type, pattern, case_sensitive, max_results }) => {
    try {
      const data = readJSONFile(file_path);
      const results: any[] = [];
      const maxRes = max_results || 100;
      const flags = case_sensitive ? 'g' : 'gi';
      const regex = new RegExp(pattern, flags);
      
      function searchObject(obj: any, currentPath: string = ""): void {
        if (results.length >= maxRes) return;
        
        if (Array.isArray(obj)) {
          obj.forEach((item, index) => {
            searchObject(item, `${currentPath}[${index}]`);
          });
        } else if (typeof obj === 'object' && obj !== null) {
          Object.entries(obj).forEach(([key, value]) => {
            const newPath = currentPath ? `${currentPath}.${key}` : key;
            
            if ((search_type === 'key' || search_type === 'both') && regex.test(key)) {
              results.push({ type: 'key', path: newPath, key, value });
            }
            
            if ((search_type === 'value' || search_type === 'both') && typeof value === 'string' && regex.test(value)) {
              results.push({ type: 'value', path: newPath, key, value });
            }
            
            searchObject(value, newPath);
          });
        }
      }
      
      searchObject(data);
      
      let markdown = `# Search Results\n\n`;
      markdown += `**Pattern:** \`${pattern}\`\n`;
      markdown += `**Matches Found:** ${results.length}\n`;
      markdown += `**Search Type:** ${search_type}\n\n`;
      
      if (results.length > 0) {
        markdown += `## Matches\n\n`;
        results.slice(0, maxRes).forEach((match, idx) => {
          markdown += `${idx + 1}. **${match.type}** at \`${match.path}\`\n`;
          markdown += `   - Key: \`${match.key}\`\n`;
          markdown += `   - Value: \`${JSON.stringify(match.value)}\`\n\n`;
        });
        
        if (results.length > maxRes) {
          markdown += `\n*...and ${results.length - maxRes} more results*\n`;
        }
      } else {
        markdown += `*No matches found*\n`;
      }
      
      return {
        content: [{ type: "text", text: markdown }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

// Tool 7: JSON Transform - Apply transformations to JSON data
server.tool(
  "json_transform",
  "Map, reduce, or sort arrays using JS expressions. Use for data transformation and aggregation.",
  {
    file_path: z.string().describe("Path to the JSON file"),
    path: z.string().optional().describe("Dot notation path to the target"),
    transform_type: z.enum(["map", "reduce", "sort"]).describe("Type of transformation"),
    expression: z.string().describe("JavaScript expression for transformation"),
  },
  async ({ file_path, path, transform_type, expression }) => {
    try {
      const data = readJSONFile(file_path);
      let target = path ? getValueByPath(data, path) : data;
      
      if (!Array.isArray(target) && transform_type !== 'reduce') {
        throw new Error("Transform target must be an array for map/sort operations");
      }
      
      let result: any;
      
      switch (transform_type) {
        case 'map':
          const mapFn = new Function('item', 'index', 'array', `return ${expression}`);
          result = target.map(mapFn);
          break;
        case 'reduce':
          const reduceFn = new Function('acc', 'item', 'index', 'array', `return ${expression}`);
          result = Array.isArray(target) ? target.reduce(reduceFn as any, {}) : reduceFn({}, target, 0, [target]);
          break;
        case 'sort':
          const sortFn = new Function('a', 'b', `return ${expression}`);
          result = [...target].sort(sortFn as any);
          break;
        default:
          throw new Error(`Unknown transform type: ${transform_type}`);
      }
      
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
      };
    }
  }
);

// Tool 8: JSON Validate - Basic validation and structure checking
server.tool(
  "json_validate",
  "Check for deep nesting, empty structures, and file validity. Use before processing unknown JSON.",
  {
    file_path: z.string().describe("Path to the JSON file"),
    check_duplicates: z.boolean().optional().describe("Check for duplicate keys in objects"),
    check_empty: z.boolean().optional().describe("Check for empty arrays/objects"),
    max_depth_check: z.number().optional().describe("Warn if nesting exceeds this depth"),
  },
  async ({ file_path, check_duplicates, check_empty, max_depth_check }) => {
    try {
      const content = readFileSync(resolve(file_path), 'utf8');
      const data = safeParseJSON(content, file_path);
      
      const issues: string[] = [];
      let maxDepth = 0;
      
      function validateObject(obj: any, currentDepth: number = 0, currentPath: string = 'root'): void {
        maxDepth = Math.max(maxDepth, currentDepth);
        
        if (max_depth_check && currentDepth > max_depth_check) {
          issues.push(`Deep nesting detected at ${currentPath} (depth: ${currentDepth})`);
        }
        
        if (Array.isArray(obj)) {
          if (check_empty && obj.length === 0) {
            issues.push(`Empty array at ${currentPath}`);
          }
          obj.forEach((item, index) => {
            validateObject(item, currentDepth + 1, `${currentPath}[${index}]`);
          });
        } else if (typeof obj === 'object' && obj !== null) {
          const keys = Object.keys(obj);
          
          if (check_empty && keys.length === 0) {
            issues.push(`Empty object at ${currentPath}`);
          }
          
          if (check_duplicates) {
            const keySet = new Set(keys);
            if (keySet.size !== keys.length) {
              issues.push(`Potential duplicate keys detected at ${currentPath}`);
            }
          }
          
          keys.forEach(key => {
            validateObject(obj[key], currentDepth + 1, `${currentPath}.${key}`);
          });
        }
      }
      
      validateObject(data);
      
      const fileSize = (content.length / 1024).toFixed(2);
      
      let markdown = `# JSON Validation Report\n\n`;
      markdown += `✓ **Valid JSON**\n\n`;
      markdown += `**File Size:** ${fileSize} KB\n`;
      markdown += `**Max Depth:** ${maxDepth}\n`;
      markdown += `**Issues Found:** ${issues.length}\n\n`;
      
      if (issues.length > 0) {
        markdown += `## Issues\n\n`;
        issues.forEach((issue, idx) => {
          markdown += `${idx + 1}. ${issue}\n`;
        });
      } else {
        markdown += `✓ No issues found\n`;
      }
      
      return {
        content: [{ type: "text", text: markdown }],
      };
    } catch (error: any) {
      return {
        content: [{ 
          type: "text", 
          text: `# JSON Validation Report\n\n✗ **Invalid JSON**\n\n**Error:** ${error.message}\n`
        }],
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