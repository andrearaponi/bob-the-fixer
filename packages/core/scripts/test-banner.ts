#!/usr/bin/env npx tsx
/**
 * Test script per verificare il banner di update
 */

import { initializeVersionChecker, getVersionChecker } from '../src/shared/version/index.js';

async function testBanner() {
  console.log('🧪 Testing version update banner...\n');

  // Simula versione vecchia
  const checker = initializeVersionChecker({
    currentVersion: '0.1.0',
    repository: 'andrearaponi/bob-the-fixer',
    checkOnInit: false,
  });

  // Esegui check manualmente
  console.log('📡 Checking for updates...');
  await checker.checkForUpdates();

  // Prova a ottenere il banner (prima volta)
  const banner1 = checker.getUpdateBannerOnce();
  console.log('\n--- FIRST CALL ---');
  if (banner1) {
    console.log('✅ Banner returned:');
    console.log(banner1);
  } else {
    console.log('❌ No banner (no update or already shown)');
  }

  // Prova a ottenere il banner (seconda volta - dovrebbe essere null)
  const banner2 = checker.getUpdateBannerOnce();
  console.log('\n--- SECOND CALL ---');
  if (banner2) {
    console.log('❌ Banner returned again (BUG!)');
    console.log(banner2);
  } else {
    console.log('✅ No banner (correctly shown only once)');
  }

  checker.destroy();
  console.log('\n✅ Test completed!');
}

testBanner().catch(console.error);
