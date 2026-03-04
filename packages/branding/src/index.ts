/**
 * @hmc/branding - White-label branding per tenant (F-016)
 *
 * Provides:
 * - Tenant-specific branding configuration
 * - CSS variable generation from branding config
 * - Complete theme stylesheet generation
 * - Dark mode support
 * - Branding validation
 *
 * Uses adapter pattern for database storage (database-agnostic).
 */

// ── Types ───────────────────────────────────────────────────────

export interface BrandingConfig {
  tenantId: string;
  appName: string;
  tagline: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  customCss: string;
  loginPageConfig: {
    backgroundUrl: string;
    welcomeText: string;
    showPoweredBy: boolean;
  };
  darkMode: {
    enabled: boolean;
    primaryColor: string;
    backgroundColor: string;
  };
}

export type ThemeVariables = Record<string, string>;

// ── Adapter ─────────────────────────────────────────────────────

export interface BrandingDbAdapter {
  getBranding(tenantId: string): Promise<BrandingConfig | null>;
  updateBranding(tenantId: string, config: Partial<BrandingConfig>): Promise<BrandingConfig>;
  deleteBranding(tenantId: string): Promise<void>;
}

// ── Defaults ────────────────────────────────────────────────────

export const DEFAULT_BRANDING: BrandingConfig = {
  tenantId: 'default',
  appName: 'HMC Platform',
  tagline: 'AI-Powered Collaboration',
  logoUrl: '/assets/logo.svg',
  faviconUrl: '/assets/favicon.ico',
  primaryColor: '#2563eb',
  secondaryColor: '#1e40af',
  accentColor: '#f59e0b',
  fontFamily: 'Inter, system-ui, sans-serif',
  customCss: '',
  loginPageConfig: {
    backgroundUrl: '/assets/login-bg.jpg',
    welcomeText: 'Welcome back',
    showPoweredBy: true,
  },
  darkMode: {
    enabled: true,
    primaryColor: '#3b82f6',
    backgroundColor: '#0f172a',
  },
};

// ── Business Logic ──────────────────────────────────────────────

/**
 * Get effective branding for a tenant, falling back to defaults.
 */
export async function getEffectiveBranding(
  adapter: BrandingDbAdapter,
  tenantId: string,
): Promise<BrandingConfig> {
  const tenantBranding = await adapter.getBranding(tenantId);

  if (!tenantBranding) {
    return { ...DEFAULT_BRANDING, tenantId };
  }

  return {
    ...DEFAULT_BRANDING,
    ...tenantBranding,
    loginPageConfig: {
      ...DEFAULT_BRANDING.loginPageConfig,
      ...tenantBranding.loginPageConfig,
    },
    darkMode: {
      ...DEFAULT_BRANDING.darkMode,
      ...tenantBranding.darkMode,
    },
  };
}

/**
 * Convert a branding config to CSS custom properties.
 */
export function generateCSSVariables(config: BrandingConfig): ThemeVariables {
  const variables: ThemeVariables = {
    '--hmc-primary': config.primaryColor,
    '--hmc-secondary': config.secondaryColor,
    '--hmc-accent': config.accentColor,
    '--hmc-font-family': config.fontFamily,
    '--hmc-logo-url': `url(${config.logoUrl})`,
    '--hmc-favicon-url': `url(${config.faviconUrl})`,
    '--hmc-login-bg': `url(${config.loginPageConfig.backgroundUrl})`,
  };

  if (config.darkMode.enabled) {
    variables['--hmc-dark-primary'] = config.darkMode.primaryColor;
    variables['--hmc-dark-bg'] = config.darkMode.backgroundColor;
  }

  return variables;
}

/**
 * Generate a complete CSS stylesheet string for injecting into the page.
 */
export function generateThemeStylesheet(config: BrandingConfig): string {
  const variables = generateCSSVariables(config);

  let css = ':root {\n';
  for (const [key, value] of Object.entries(variables)) {
    if (!key.startsWith('--hmc-dark-')) {
      css += `  ${key}: ${value};\n`;
    }
  }
  css += `  font-family: ${config.fontFamily};\n`;
  css += '}\n\n';

  if (config.darkMode.enabled) {
    css += '@media (prefers-color-scheme: dark) {\n';
    css += '  :root {\n';
    css += `    --hmc-primary: ${config.darkMode.primaryColor};\n`;
    css += `    --hmc-bg: ${config.darkMode.backgroundColor};\n`;
    css += '  }\n';
    css += '}\n\n';

    css += '[data-theme="dark"] {\n';
    css += `  --hmc-primary: ${config.darkMode.primaryColor};\n`;
    css += `  --hmc-bg: ${config.darkMode.backgroundColor};\n`;
    css += '}\n';
  }

  if (config.customCss) {
    css += '\n/* Custom tenant CSS */\n';
    css += config.customCss;
    css += '\n';
  }

  return css;
}

/**
 * Validate a partial branding configuration.
 */
export function validateBrandingConfig(
  config: Partial<BrandingConfig>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.primaryColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(config.primaryColor)) {
    errors.push('primaryColor must be a valid hex color (e.g. #2563eb)');
  }

  if (config.secondaryColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(config.secondaryColor)) {
    errors.push('secondaryColor must be a valid hex color (e.g. #1e40af)');
  }

  if (config.accentColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(config.accentColor)) {
    errors.push('accentColor must be a valid hex color (e.g. #f59e0b)');
  }

  if (config.appName !== undefined && config.appName.length === 0) {
    errors.push('appName cannot be empty');
  }

  if (config.appName !== undefined && config.appName.length > 100) {
    errors.push('appName must be 100 characters or fewer');
  }

  if (config.logoUrl !== undefined && config.logoUrl.length === 0) {
    errors.push('logoUrl cannot be empty');
  }

  if (config.faviconUrl !== undefined && config.faviconUrl.length === 0) {
    errors.push('faviconUrl cannot be empty');
  }

  if (config.fontFamily !== undefined && config.fontFamily.length === 0) {
    errors.push('fontFamily cannot be empty');
  }

  if (config.darkMode !== undefined) {
    if (config.darkMode.primaryColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(config.darkMode.primaryColor)) {
      errors.push('darkMode.primaryColor must be a valid hex color');
    }
    if (config.darkMode.backgroundColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(config.darkMode.backgroundColor)) {
      errors.push('darkMode.backgroundColor must be a valid hex color');
    }
  }

  return { valid: errors.length === 0, errors };
}
