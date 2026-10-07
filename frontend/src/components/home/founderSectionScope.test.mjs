/**
 * Scope guard for FounderMeetingSection.
 *
 * This file holds three components in one module (RegistrationModal,
 * RegistrationForm, FounderMeetingSection). A hook result declared inside one
 * of them is NOT visible in the others — but because they share a module, a
 * stray reference still type-checks and still builds, and only explodes as a
 * ReferenceError when that branch actually renders. A past/closed session is
 * exactly such a rarely-exercised branch.
 *
 * That really happened here: the "Explore our courses" button in the
 * past-session card called `navigate(...)` while the only `navigate` in the
 * file belonged to RegistrationForm. tsc --noEmit and `vite build` both passed.
 *
 * So this asserts structurally: every component that references a hook value
 * must also declare it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = join(dirname(fileURLToPath(import.meta.url)), 'FounderMeetingSection.tsx');
const SRC = readFileSync(FILE, 'utf8');
const LINES = SRC.split('\n');

// Top-level `const Name = (` declarations are the component boundaries.
const componentRanges = () => {
  const starts = [];
  LINES.forEach((line, i) => {
    const m = line.match(/^const ([A-Z][A-Za-z0-9]*) = \(/);
    if (m) starts.push({ name: m[1], start: i });
  });
  return starts.map((s, i) => ({
    ...s,
    end: i + 1 < starts.length ? starts[i + 1].start - 1 : LINES.length - 1,
  }));
};

// Hook values that are per-component and crash if referenced from elsewhere.
const HOOK_BINDINGS = [
  { name: 'navigate', decl: /const navigate = useNavigate\(\)/ },
];

test('every component declares the hook values it uses', () => {
  const comps = componentRanges();
  assert.ok(comps.length >= 2, 'expected several components in this module');

  const problems = [];
  for (const comp of comps) {
    const body = LINES.slice(comp.start, comp.end + 1).join('\n');
    for (const hook of HOOK_BINDINGS) {
      // Does this component CALL the binding?
      const uses = new RegExp(`\\b${hook.name}\\s*\\(`).test(body);
      if (!uses) continue;
      if (!hook.decl.test(body)) {
        problems.push(
          `${comp.name} (line ${comp.start + 1}) calls ${hook.name}() but never declares it — ` +
            'it resolves to another component\'s binding and throws at runtime',
        );
      }
    }
  }
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('the past-session card offers a next step rather than dead-ending', () => {
  // The least impressive state on the page was a bare grey sentence; it should
  // acknowledge the state AND route the visitor somewhere useful.
  assert.match(SRC, /This session has wrapped/, 'past sessions need a real panel');
  assert.match(SRC, /Explore our courses/, 'a past session must still offer a next step');
});

test('the decorative CTA sweep never swallows the click', () => {
  // An absolutely-positioned overlay inside a button must not intercept input.
  const sweep = SRC.match(/<span\s[^>]*via-white\/30[\s\S]*?\/>/);
  assert.ok(sweep, 'expected the hover sweep span on the register button');
  assert.match(sweep[0], /pointer-events-none/, 'the sweep must not block the button');
  assert.match(sweep[0], /aria-hidden/, 'pure decoration must be hidden from assistive tech');
  assert.match(sweep[0], /motion-reduce:hidden/, 'respect prefers-reduced-motion');
});
