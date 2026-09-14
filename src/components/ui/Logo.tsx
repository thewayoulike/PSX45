import React from 'react';

interface LogoProps {
  className?: string;
  variant?: 'stacked' | 'horizontal' | 'icon';
  tagline?: boolean;
}

/** Selected Premium Badge. Theme follows the app's .dark class. */
export const Logo: React.FC<LogoProps> = ({ className = '', variant = 'stacked', tagline = true }) => (
  <div className={`brand-logo brand-logo--${variant} ${className}`} role="img" aria-label={`PSX Tracker${tagline && variant !== 'icon' ? '. Know more. Earn more.' : ''}`}>
    <span className="brand-logo__mark" aria-hidden="true">
      <img className="brand-logo__light" src="/brand/premium-badge.svg" alt="" width="382" height="430" decoding="async" />
      <img className="brand-logo__dark" src="/brand/premium-badge-dark.svg" alt="" width="382" height="430" decoding="async" />
    </span>
    {variant !== 'icon' && <span className="brand-logo__type" aria-hidden="true">
      <span className="brand-logo__name"><b>PSX</b><span>Tracker</span></span>
      {tagline && <span className="brand-logo__tagline"><span className="brand-logo__know">KNOW MORE.</span>{' '}<span className="brand-logo__earn">EARN MORE.</span></span>}
    </span>}
  </div>
);
