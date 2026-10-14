// Joined source tests require an explicit reviewed checkout. Never inspect
// another build's worktree through a hardcoded sibling path.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

exports.backendSourcePath = (name) => {
  if (!['bpay-next-frozen-read.js', 'bpay-next-history.js'].includes(name)) {
    throw new Error('BACKEND_TEST_SOURCE_FILE_REFUSED');
  }
  const input = process.env.CLOUDTMS_TEST_BACKEND_SOURCE_ROOT;
  if (!input || !path.isAbsolute(input)) throw new Error('BACKEND_TEST_SOURCE_ROOT_REQUIRED');
  const root = fs.realpathSync(input);
  if (/[/\\]bpay-next-build-backend-/i.test(root)) {
    throw new Error('OTHER_BUILD_TEST_SOURCE_REFUSED');
  }
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (metadata.name !== 'cloudtms-backend') throw new Error('BACKEND_TEST_SOURCE_REPOSITORY_REFUSED');
  return path.join(root, 'broker', 'src', name);
};
exports.backendSourceUrl = name => pathToFileURL(exports.backendSourcePath(name)).href;
