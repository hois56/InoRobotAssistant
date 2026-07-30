const path = require('path');
const { loadVersionHistory, writeGeneratedArtifacts } = require('./version-history.cjs');

const root = path.resolve(__dirname, '..');
const versionHistory = loadVersionHistory(root);
writeGeneratedArtifacts(root, versionHistory);
console.log('Built version history artifacts from 0_Home/version-history.json.');
