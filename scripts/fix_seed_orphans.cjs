const fs = require('fs');
let text = fs.readFileSync('data/seed_gcck_1233.json', 'utf8');
text = text.replace(/"NV_KT01"/g, '"NV00101"')
           .replace(/"NV_KT02"/g, '"NV00102"')
           .replace(/"NV_KT03"/g, '"NV00103"');
fs.writeFileSync('data/seed_gcck_1233.json', text, 'utf8');
console.log('Fixed orphan keys in data/seed_gcck_1233.json!');
