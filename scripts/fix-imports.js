#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Path to the index.js file
const indexPath = path.join(__dirname, '..', 'dist', 'index.js');

// Read the file
let content = fs.readFileSync(indexPath, 'utf8');

// Replace imports without .js extension
// This regex matches import statements from local files (starting with ./)
content = content.replace(/from '(\.\/[^']+)(?<!\.js)'/g, "from '$1.js'");

// Write the file back
fs.writeFileSync(indexPath, content);

console.log('Fixed imports in dist/index.js');