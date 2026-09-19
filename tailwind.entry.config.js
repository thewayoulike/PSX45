import base from './tailwind.config.js';
export default {
  ...base,
  content: ['./index.html', './src/components/{Entry,LoginPage,AppLoading,DriveSetupPrompt,ErrorBoundary,OfflinePortfolio,PasswordRecovery}.tsx', './src/components/ui/{Logo,BrandLogo,ThemeToggle,VideoGuideLink}.tsx'],
};
