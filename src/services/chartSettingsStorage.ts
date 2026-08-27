import { AwaisLayers, DEFAULT_AWAIS_LAYERS, cloneAwaisLayers } from '../utils/awaisIndicators';
import { DEFAULT_MOMENTUM_CONFIG, MomentumConfig, cloneMomentumConfig } from '../utils/momentumIndicators';

export const CHART_SETTINGS_KEY = 'psx_chart_settings';
export const CHART_SETTINGS_EVENT = 'psx-chart-settings-updated';
export const CHART_SETTINGS_CHANGED_EVENT = 'psx-chart-settings-changed';

export interface ChartLayerToggles {
  volume: boolean;
  momentum: boolean;
}

export interface ChartUserSettings {
  version: 1;
  layers: ChartLayerToggles;
  awaisLayers: AwaisLayers;
  momentumConfig: MomentumConfig;
}

const DEFAULT_CHART_SETTINGS: ChartUserSettings = {
  version: 1,
  layers: { volume: true, momentum: true },
  awaisLayers: DEFAULT_AWAIS_LAYERS,
  momentumConfig: DEFAULT_MOMENTUM_CONFIG,
};

export function cloneChartSettings(settings: ChartUserSettings): ChartUserSettings {
  return {
    version: 1,
    layers: { ...settings.layers },
    awaisLayers: cloneAwaisLayers(settings.awaisLayers),
    momentumConfig: cloneMomentumConfig(settings.momentumConfig),
  };
}

function normalizeChartSettings(raw: unknown): ChartUserSettings {
  const base = cloneChartSettings(DEFAULT_CHART_SETTINGS);
  if (!raw || typeof raw !== 'object') return base;

  const o = raw as Partial<ChartUserSettings>;
  if (o.layers && typeof o.layers === 'object') {
    if (typeof o.layers.volume === 'boolean') base.layers.volume = o.layers.volume;
    if (typeof o.layers.momentum === 'boolean') base.layers.momentum = o.layers.momentum;
  }
  if (o.awaisLayers && typeof o.awaisLayers === 'object' && 'groups' in o.awaisLayers) {
    base.awaisLayers = cloneAwaisLayers(o.awaisLayers as AwaisLayers);
  }
  if (o.momentumConfig && typeof o.momentumConfig === 'object') {
    base.momentumConfig = cloneMomentumConfig(o.momentumConfig as MomentumConfig);
  }
  return base;
}

export function loadChartSettings(): ChartUserSettings {
  try {
    const raw = localStorage.getItem(CHART_SETTINGS_KEY);
    if (!raw) return cloneChartSettings(DEFAULT_CHART_SETTINGS);
    return normalizeChartSettings(JSON.parse(raw));
  } catch {
    return cloneChartSettings(DEFAULT_CHART_SETTINGS);
  }
}

export function persistChartSettings(partial: Partial<ChartUserSettings>): ChartUserSettings {
  const current = loadChartSettings();
  const next = cloneChartSettings({
    version: 1,
    layers: { ...current.layers, ...partial.layers },
    awaisLayers: partial.awaisLayers ?? current.awaisLayers,
    momentumConfig: partial.momentumConfig ?? current.momentumConfig,
  });
  try {
    localStorage.setItem(CHART_SETTINGS_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(CHART_SETTINGS_CHANGED_EVENT));
  } catch {
    /* ignore quota errors */
  }
  return next;
}

/** Apply settings restored from Google Drive and notify open charts. */
export function applyCloudChartSettings(cloud: unknown): ChartUserSettings | null {
  if (!cloud) return null;
  const normalized = normalizeChartSettings(cloud);
  try {
    localStorage.setItem(CHART_SETTINGS_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(CHART_SETTINGS_EVENT, { detail: normalized }));
  return normalized;
}
