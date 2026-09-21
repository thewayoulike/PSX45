import base from './tailwind.config.js';
export default {
  ...base,
  // Include the login page's previews and shared footer: they render before
  // the signed-in app stylesheet is downloaded.
  content: [
    './index.html',
    './src/components/Login*.tsx',
    './src/components/{Entry,SiteFooter,AppLoading,DriveSetupPrompt,ErrorBoundary,OfflinePortfolio,PasswordRecovery}.tsx',
    './src/components/ui/{Logo,BrandLogo,ThemeToggle,VideoGuideLink}.tsx',
  ],
};
