const ROOT = '/static/new-ui';

export const UI_ASSETS = {
  backgrounds: {
    home: `${ROOT}/backgrounds/bg-home-luxury-hero.png`,
    purchase: `${ROOT}/backgrounds/bg-purchase-globe.png`,
    account: `${ROOT}/backgrounds/bg-account-globe.png`,
    buyer: `${ROOT}/backgrounds/bg-buyer-world-map.png`,
    chain: `${ROOT}/backgrounds/bg-chain-circuit.png`,
    login: `${ROOT}/backgrounds/bg-login-orbit-globe.png`,
    vip: `${ROOT}/backgrounds/bg-vip-wave.png`,
    points: `${ROOT}/backgrounds/bg-points-orbit.png`,
    ai: `${ROOT}/backgrounds/bg-ai-aurora.png`,
    finance: `${ROOT}/backgrounds/bg-finance-gold-wave.png`
  },
  illustrations: {
    homeGuarantee: `${ROOT}/illustrations/illustration-home-guarantee-shield.png`,
    homeVip: `${ROOT}/illustrations/illustration-home-vip-card.png`,
    purchase: `${ROOT}/illustrations/illustration-purchase-bag.png`,
    wallet: `${ROOT}/illustrations/illustration-wallet-gold.png`,
    buyerDeposit: `${ROOT}/illustrations/illustration-buyer-deposit-shield.png`,
    network: `${ROOT}/illustrations/illustration-network-triangle.png`,
    finance: `${ROOT}/illustrations/illustration-finance-u-shield.png`,
    vipCrown: `${ROOT}/illustrations/illustration-vip-crown-plaque.png`,
    vipBadge: `${ROOT}/illustrations/illustration-vip-tier-badge.png`,
    ai: `${ROOT}/illustrations/illustration-ai-bot.png`,
    status: `${ROOT}/illustrations/illustration-status-shield-neutral.png`,
    kyc: `${ROOT}/illustrations/illustration-kyc-user-shield.png`,
    empty: `${ROOT}/illustrations/illustration-empty-search-box.png`,
    error: `${ROOT}/illustrations/illustration-error-broken-link.png`
  },
  placeholders: {
    upload: `${ROOT}/placeholders/placeholder-upload.png`,
    product: `${ROOT}/placeholders/placeholder-product.png`,
    avatar: `${ROOT}/placeholders/placeholder-avatar.png`,
    evidence: `${ROOT}/placeholders/placeholder-evidence.png`
  },
  icons: {
    brand: `${ROOT}/icons/custom/brand-youbao-mark.png`,
    verifiedBuyer: `${ROOT}/icons/custom/icon-buyer-verified.png`,
    tokenU: `${ROOT}/icons/custom/icon-token-u.png`
  }
} as const;

export const UI_ASSET_ROOT = ROOT;
