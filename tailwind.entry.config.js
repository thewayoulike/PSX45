import base from './tailwind.config.js';
export default {
  ...base,
  // Include the login page's previews and shared footer: they render before
  // the signed-in app stylesheet is downloaded.
  content: [
    './index.html',
    './src/components/Login*.tsx',
    './src/components/{DashboardStats,MobileLayout,MobilePortfolioValue,MobileFitLine,FundNumberPanel,HoverPopover,PriceStaleNotice}.tsx',
    './src/components/ui/MobileDataTable.tsx',
    './src/components/{Entry,EntrySession,GoogleAuthButton,HeroMovers,SiteFooter,AppLoading,DriveSetupPrompt,ErrorBoundary,OfflinePortfolio,PasswordRecovery}.tsx',
    './src/components/ui/{Logo,BrandLogo,ThemeToggle,VideoGuideLink}.tsx',
  ],
};
