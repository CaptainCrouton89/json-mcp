#!/usr/bin/env node

// Generate a large JSON file for testing truncation
import fs from 'fs';

function generateLargeJSON() {
  const data = {
    // Long string (over 200 chars)
    longString: "This is a very long string that definitely exceeds 200 characters and should be truncated by our new truncation function. ".repeat(10),
    
    // Large array (over 1 item)
    largeArray: [],
    
    // Object with many properties (over 200)
    manyProperties: {},
    
    // Nested structure with long strings and arrays
    nested: {
      level1: {
        level2: {
          longText: "Another very long string that should be truncated. ".repeat(20),
          items: []
        }
      }
    }
  };

  // Generate large array with 100 items
  for (let i = 1; i <= 100; i++) {
    data.largeArray.push({
      id: i,
      name: `Item ${i}`,
      description: `This is a description for item ${i}. It has some content that makes it longer.`,
      tags: [`tag${i}`, `category${i % 5}`, `type${i % 3}`],
      metadata: {
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        version: i
      }
    });
  }

  // Generate object with 250 properties
  for (let i = 1; i <= 250; i++) {
    data.manyProperties[`property${i}`] = {
      value: `Value for property ${i}`,
      type: i % 2 === 0 ? 'even' : 'odd',
      data: `Some additional data for property ${i}`.repeat(3)
    };
  }

  // Add items to nested array
  for (let i = 1; i <= 50; i++) {
    data.nested.level1.level2.items.push({
      itemId: i,
      content: `Content for nested item ${i}. This has some text to make it longer.`.repeat(2)
    });
  }

  return data;
}

const largeJSON = generateLargeJSON();
const jsonString = JSON.stringify(largeJSON, null, 2);

console.log(`Generated JSON size: ${jsonString.length} characters`);

fs.writeFileSync('large-test-generated.json', jsonString);
console.log('Large test file written to large-test-generated.json');