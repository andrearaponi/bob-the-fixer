#!/usr/bin/env npx tsx
/**
 * Script per testare manualmente il VersionChecker
 * Esegui con: npx tsx scripts/test-version-check.ts
 */

const GITHUB_API_BASE = 'https://api.github.com';
const REPOSITORY = 'andrearaponi/bob-the-fixer';
const CURRENT_VERSION = '0.1.0'; // Simula una versione vecchia

interface GitHubRelease {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
}

function normalizeVersion(version: string): string {
  return version.replace(/^v/i, '');
}

function parseVersion(version: string) {
  const normalized = normalizeVersion(version);
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/.exec(normalized);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
  };
}

function isNewerVersion(versionA: string, versionB: string): boolean {
  const a = parseVersion(versionA);
  const b = parseVersion(versionB);
  if (!a || !b) return versionA > versionB;

  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  if (a.patch !== b.patch) return a.patch > b.patch;

  if (!a.prerelease && b.prerelease) return true;
  if (a.prerelease && !b.prerelease) return false;
  if (a.prerelease && b.prerelease) return a.prerelease > b.prerelease;

  return false;
}

async function testVersionCheck() {
  console.log('🔍 Testing Version Checker...\n');
  console.log(`📦 Current version (simulated): ${CURRENT_VERSION}`);
  console.log(`🔗 Repository: ${REPOSITORY}\n`);

  try {
    const url = `${GITHUB_API_BASE}/repos/${REPOSITORY}/releases`;
    console.log(`📡 Fetching: ${url}\n`);

    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'bob-the-fixer-test',
      },
    });

    if (!response.ok) {
      console.error(`❌ GitHub API error: ${response.status}`);
      console.log('\n💡 Se vedi 404, significa che non ci sono ancora releases.');
      console.log('   Crea una release su GitHub per testare il sistema.');
      return;
    }

    const releases = (await response.json()) as GitHubRelease[];

    if (releases.length === 0) {
      console.log('📭 No releases found on GitHub.\n');
      console.log('💡 Per testare, crea una release su GitHub:');
      console.log('   1. Vai su https://github.com/andrearaponi/bob-the-fixer/releases/new');
      console.log('   2. Crea un tag (es. v0.2.0)');
      console.log('   3. Pubblica la release');
      return;
    }

    console.log(`📋 Found ${releases.length} release(s):\n`);

    // Filter out drafts and prereleases
    const validReleases = releases.filter((r) => !r.draft && !r.prerelease);

    if (validReleases.length === 0) {
      console.log('⚠️  No stable releases found (only drafts/prereleases).\n');
      console.log('All releases:');
      releases.forEach((r) => {
        console.log(`   - ${r.tag_name} ${r.draft ? '(draft)' : ''} ${r.prerelease ? '(prerelease)' : ''}`);
      });
      return;
    }

    const latest = validReleases[0];
    const latestVersion = normalizeVersion(latest.tag_name);

    console.log(`✅ Latest stable release: ${latest.tag_name}`);
    console.log(`   Name: ${latest.name}`);
    console.log(`   URL: ${latest.html_url}`);
    console.log(`   Published: ${latest.published_at}\n`);

    const updateAvailable = isNewerVersion(latestVersion, CURRENT_VERSION);

    if (updateAvailable) {
      console.log('🆕 UPDATE AVAILABLE!');
      console.log(`   A new version of Bob the Fixer is available: ${latestVersion} (current: ${CURRENT_VERSION})`);
      console.log('\n✅ Il VersionChecker funziona! Questa notifica verrebbe inviata al client MCP.');
    } else {
      console.log('✓ You are on the latest version.');
      console.log(`   Current: ${CURRENT_VERSION}, Latest: ${latestVersion}`);
    }

  } catch (error) {
    console.error('❌ Network error:', error instanceof Error ? error.message : error);
    console.log('\n💡 Questo errore verrebbe ignorato silenziosamente in produzione (supporto offline).');
  }
}

testVersionCheck();
