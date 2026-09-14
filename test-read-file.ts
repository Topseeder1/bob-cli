// File: test-read-file.ts
// Quick test for IDRP readFile capability.
// Run with: npx tsx test-read-file.ts

import { readFile } from './src/idrp/read-file.js';

// Test 1: Read a file that exists
console.log('--- Test 1: Valid file ---');
const result1 = readFile({ path: 'package.json' });
console.log(result1.success ? result1.content.slice(0, 500) : `ERROR: ${result1.error}`);
console.log();

// Test 2: Read with a line range
console.log('--- Test 2: Line range ---');
const result2 = readFile({ path: 'package.json', startLine: 5, endLine: 15 });
console.log(result2.success ? result2.content : `ERROR: ${result2.error}`);
console.log();

// Test 3: Path traversal attempt
console.log('--- Test 3: Path traversal ---');
const result3 = readFile({ path: '../../etc/passwd' });
console.log(result3.success ? 'SHOULD NOT SEE THIS' : `BLOCKED: ${result3.error}`);
console.log();

// Test 4: Blocked directory (node_modules)
console.log('--- Test 4: Blocked directory ---');
const result4 = readFile({ path: 'node_modules/chalk/package.json' });
console.log(result4.success ? result4.content.slice(0, 200) : `BLOCKED: ${result4.error}`);
console.log();

// Test 5: File that doesn't exist
console.log('--- Test 5: Missing file ---');
const result5 = readFile({ path: 'src/does-not-exist.ts' });
console.log(result5.success ? 'SHOULD NOT SEE THIS' : `BLOCKED: ${result5.error}`);
console.log();

// Test 6: Truncation test (use a small maxLines to force it)
console.log('--- Test 6: Truncation ---');
const result6 = readFile(
  { path: 'package.json' },
  process.cwd(),
  { idrpReadFileMaxLines: 5 }
);
if (result6.success) {
  console.log(result6.content);
  console.log(`\nTruncated: ${result6.metadata?.wasTruncated}`);
  console.log(`Returned: lines ${result6.metadata?.returnedRange.start}-${result6.metadata?.returnedRange.end} of ${result6.metadata?.totalLines}`);
} else {
  console.log(`ERROR: ${result6.error}`);
}