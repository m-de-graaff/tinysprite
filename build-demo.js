#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 Building demo.html with injected library.json...');

try {
  // Read the library.json file
  const libraryPath = path.join(__dirname, 'pages', 'library.json');
  const libraryContent = fs.readFileSync(libraryPath, 'utf8');
  
  // Read the demo.html file
  const demoPath = path.join(__dirname, 'pages', 'demo.html');
  let demoContent = fs.readFileSync(demoPath, 'utf8');
  
  // Find the script tag with id="ts-library" and replace its content
  const scriptRegex = /<script id="ts-library" type="application\/json">[\s\S]*?<\/script>/;
  
  if (scriptRegex.test(demoContent)) {
    // Replace the existing script tag content
    const newScriptTag = `<script id="ts-library" type="application/json">\n    ${libraryContent}\n  </script>`;
    demoContent = demoContent.replace(scriptRegex, newScriptTag);
    
    // Write the updated demo.html
    fs.writeFileSync(demoPath, demoContent, 'utf8');
    console.log('✅ Successfully injected library.json into demo.html');
  } else {
    console.error('❌ Could not find ts-library script tag in demo.html');
    process.exit(1);
  }
  
} catch (error) {
  console.error('❌ Error processing files:', error.message);
  process.exit(1);
}
