"""Freeze or verify this finite Office-only source proposal; no native/network calls."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys

here = Path(__file__).resolve().parent
repo = here.parents[3]
assert str(repo).replace('\\', '/').startswith('D:/Development/GitHub/')
sha = lambda value: hashlib.sha256(value).hexdigest()
base = '0840c9b0cf53d4f0152c83f0a34bca96ad3345da'
targets = [
    'index.html', 'js/weekly-source/workspace-actions.js',
    'js/weekly-source/import-workspace.js',
    'tests/helpers/kept-office-parent-reverse.mjs',
    'js/weekly-source/paid-match-contract.js',
    'js/weekly-source/paid-match-controls.js', 'css/paid-match.css',
    'tests/helpers/paid-match-office-parent-reverse.mjs',
    'tests/unit/paid-match-controls.test.mjs',
    'tests/unit/paid-match-parent.test.mjs',
    'tests/ui/paid-match-local-browser.mjs',
]

def git_bytes(commit, path):
    return subprocess.check_output(['git', '-c', 'gc.auto=0', '-c',
        'maintenance.auto=false', 'show', commit + ':' + path], cwd=repo)

def forms(raw):
    result = [{'form': 'SAVED', 'sha256': sha(raw), 'bytes': len(raw)}]
    try:
        raw.decode('utf-8')
    except UnicodeDecodeError:
        return result
    lf = raw.replace(b'\r\n', b'\n')
    for name, value in [('LF', lf), ('COMPLETE_CRLF', lf.replace(b'\n', b'\r\n'))]:
        result.append({'form': name, 'sha256': sha(value), 'bytes': len(value)})
    return result

def admissible(raw, row):
    return any(sha(raw) == form['sha256'] and len(raw) == form['bytes']
               for form in row['exactCheckoutForms'])

assert not list(here.glob('browser-tmp*')), 'Owned browser profiles must be removed'
parents = json.loads((here / 'PARENT_EDITS.json').read_bytes())
assert parents['base'] == base and len(parents['edits']) == 4
assert sum(len(edit['hunks']) for edit in parents['edits']) == 18
for edit in parents['edits']:
    raw = (repo / edit['target']).read_bytes()
    assert sha(raw.replace(b'\r\n', b'\n')) == edit['outputCanonicalSha256']
    assert (here / 'payload' / edit['target']).read_bytes().replace(b'\r\n', b'\n') == raw.replace(b'\r\n', b'\n')
    before = (here / 'inputs' / edit['target'].replace('/', '__')).read_bytes()
    assert sha(before.replace(b'\r\n', b'\n')) == edit['inputCanonicalSha256']
    assert before.replace(b'\r\n', b'\n') == git_bytes(base, edit['target']).replace(b'\r\n', b'\n')
for path, row in parents['protectedUnchanged'].items():
    raw = (repo / path).read_bytes()
    assert raw.replace(b'\r\n', b'\n') == git_bytes(base, path).replace(b'\r\n', b'\n'), path
    assert sha(git_bytes(base, path)) == row['gitSha256'], path
for path in targets[4:7]:
    assert (here / 'payload' / path).read_bytes().replace(b'\r\n', b'\n') == (repo / path).read_bytes().replace(b'\r\n', b'\n')
unit = json.loads((here / 'UNIT_TEST_RESULTS.json').read_bytes())
browser = json.loads((here / 'BROWSER_RESULTS.json').read_bytes())
assert unit['counts'] == {'tests': 192, 'pass': 192, 'fail': 0, 'skipped': 0}
assert unit['originalTestsUnchanged'] == 170 and unit['newProtocolAndHostTests'] == 22
assert len(browser['cases']) == 6 and browser['pageErrors'] == 0 and browser['externalRequests'] == 0
for row in unit['files'] + browser['sourcePins']:
    raw = (repo / row['file']).read_bytes()
    if sha(raw) != row['sha256']:
        # Old unchanged tests include complete saved CRLF forms. A peer's LF
        # checkout may differ; admit only exact full forms of the pinned file.
        frozen_file = here / 'MANIFEST.json'
        frozen_rows = json.loads(frozen_file.read_bytes())['files'] if frozen_file.exists() and '--verify' in sys.argv else []
        pin = next((item for item in frozen_rows if item['path'] == row['file']), None)
        accepted = pin['exactCheckoutForms'] if pin else forms(git_bytes(base, row['file']))
        assert row['sha256'] in {item['sha256'] for item in accepted}, row['file']
        assert any(sha(raw) == item['sha256'] and len(raw) == item['bytes'] for item in accepted), row['file']
derivation = json.loads((here / 'CONTRACT_DERIVATION.json').read_bytes())
assert sha((repo / derivation['output']).read_bytes().replace(b'\r\n', b'\n')) == derivation['outputSha256']
backend = json.loads((here / 'BACKEND_SOURCE_PINS.json').read_bytes())
assert backend['currentRootCommit'] == '84738fe4057d9d693ccd723eb1835106f1091f57'
assert len(backend['currentRootExactSelectedConsumers']) == 9

paths = sorted(set(targets + [p.relative_to(repo).as_posix()
    for p in here.rglob('*') if p.is_file() and p.name != 'MANIFEST.json']))
assert not any('__pycache__' in path or 'browser-tmp' in path for path in paths)
patterns = {
    'PRIVATE_KEY': rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
    'GITHUB_TOKEN': rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})',
    'AWS_ACCESS_KEY': rb'AKIA[0-9A-Z]{16}',
    'JWT': rb'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{15,}',
}
findings = []
for path in paths:
    raw = (repo / path).read_bytes()
    try:
        raw.decode('utf-8')
    except UnicodeDecodeError:
        continue
    for kind, pattern in patterns.items():
        if re.search(pattern, raw):
            findings.append({'path': path, 'kind': kind})
assert not findings, json.dumps(findings)  # Never prints matched values.
for path in ['derive-contract.py', 'seal.py', 'freeze.py', 'unit-tests.mjs']:
    raw = (here / path).read_bytes()
    assert not re.search(rb'C:[/\\](?:tmp[/\\]|Users[/\\][^\r\n]*?(?:OneDrive|\.codex))', raw, re.I), path
raw = (repo / targets[-1]).read_bytes()
assert not re.search(rb'C:[/\\](?:tmp[/\\]|Users[/\\][^\r\n]*?(?:OneDrive|\.codex))', raw, re.I)

manifest = {
    'OfficeInput': base, 'branch': 'codex/healthroster-v2-office-13102026',
    'backend': backend['correctedBackend'], 'currentBackendRoot': backend['currentRootCommit'],
    'authorModel': 'gpt-6.1-sol/xhigh',
    'verdict': 'SOURCE_IMPLEMENTED_INDEPENDENT_PEER_PENDING',
    'targets': targets, 'completeParents': 4, 'finiteHunks': 18,
    'protectedUnchanged': parents['protectedUnchanged'],
    'validation': {'tests': 192, 'originalTestsUnchanged': 170, 'newTests': 22,
        'controlledBrowserCases': 6, 'externalRequests': 0, 'pageErrors': 0,
        'credentialPatterns': list(patterns), 'credentialFindings': 0,
        'launcherFormerDevelopmentPaths': 0},
    'native': 'NOT_RUN', 'API': 'NOT_RUN', 'inApp': 'NOT_RUN',
    'release': 'NOT_RUN', 'publication': 'NOT_RUN', 'BankOwnedBodiesRead': 0,
    'lineEndingPolicy': 'Only the recorded exact full SAVED, LF or COMPLETE_CRLF bytes are admissible; no partial/content drift.',
    'files': [{'path': path, 'exactCheckoutForms': forms((repo / path).read_bytes())} for path in paths],
}
destination = here / 'MANIFEST.json'
if '--verify' in sys.argv:
    frozen = json.loads(destination.read_bytes())
    assert frozen['targets'] == targets and {row['path'] for row in frozen['files']} == set(paths)
    for row in frozen['files']:
        assert admissible((repo / row['path']).read_bytes(), row), row['path']
    for key in ['OfficeInput', 'backend', 'currentBackendRoot', 'completeParents', 'finiteHunks', 'validation']:
        assert frozen[key] == manifest[key], key
else:
    destination.write_bytes((json.dumps(manifest, indent=2) + '\n').encode('utf-8'))
print(json.dumps({'files': len(paths), 'targets': len(targets), 'manifestSha256': sha(destination.read_bytes()),
    'tests': 192, 'controlledBrowserCases': 6, 'credentialsFound': 0, 'native': 'NOT_RUN'}))
