import { DesignerRole, DESIGNER_LANES } from '../types';

/**
 * Design role → display metadata.
 * Single source of truth for colors, labels, and descriptions
 * used throughout the design phase UI.
 */

export const ROLE_META: Record<DesignerRole, {
  color: string;
  label: string;
  description: string;
}> = {
  visual_spatial: {
    color: '#5a8fe0',
    label: 'Visual Lead',
    description: 'Layout, visual hierarchy, mockup feel',
  },
  structure_ux: {
    color: '#e07b5a',
    label: 'Structure Lead',
    description: 'App shell, flow, information architecture',
  },
  product_practical: {
    color: '#5ab88e',
    label: 'Product Lead',
    description: 'Realistic UX, PM thinking, constraints',
  },
  wildcard_fusion: {
    color: '#8a8ae0',
    label: 'Wildcard',
    description: 'Blending, bold options, style exploration',
  },
};

/** Resolve preferred_model for a given role from DESIGNER_LANES. */
export function modelForRole(role: DesignerRole): string {
  const lane = DESIGNER_LANES.find(l => l.role === role);
  return lane?.preferred_model ?? 'gpt-5.4-mini';
}
