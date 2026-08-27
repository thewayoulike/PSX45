import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const c = execSync('git show HEAD:src/components/LoginPage.tsx', { cwd: 'D:/PSX45', encoding: 'utf8' });
const lines = c.split(/\r?\n/);
const mocks = lines.slice(192, 534).join('\n')
  .replace(/^const DashboardShot/, 'export const DashboardShot')
  .replace(/^const RealizedShot/, 'export const RealizedShot');

const out = `import React from 'react';
import { Wallet, ShieldCheck, Building2, TrendingUp, Activity, Coins } from 'lucide-react';

${mocks}
`;

writeFileSync('D:/PSX45/src/components/LoginPreviewMocks.tsx', out, 'utf8');
console.log('written', out.length);
